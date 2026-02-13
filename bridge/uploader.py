"""
HTTPS Batch Uploader with HMAC Signing

Pushes batches of telemetry records from the SQLite buffer to the cloud API.
Features: HMAC-SHA256 signing, exponential backoff retry, batch upload.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import time
from typing import Optional

import aiohttp

from .buffer import BufferDB
from .config import BridgeConfig

logger = logging.getLogger(__name__)


def _sign_request(
    secret: str, method: str, path: str, body: bytes
) -> tuple[str, str]:
    """
    Compute HMAC-SHA256 signature matching cloud middleware.

    Returns:
        (signature_hex, timestamp_str)
    """
    timestamp = str(int(time.time()))
    body_hash = hashlib.sha256(body).hexdigest()
    message = f"{method}\n{path}\n{timestamp}\n{body_hash}"
    signature = hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return signature, timestamp


class CloudUploader:
    """Push telemetry batches to the SCENSUS cloud API."""

    def __init__(self, config: BridgeConfig, buffer: BufferDB):
        self.config = config
        self.buffer = buffer
        self._session: Optional[aiohttp.ClientSession] = None
        self._running = False
        self._push_task: Optional[asyncio.Task] = None
        self._consecutive_failures = 0

    async def start(self) -> None:
        """Start the push loop."""
        if self._running:
            return

        self._running = True
        self._session = aiohttp.ClientSession()
        self._push_task = asyncio.create_task(self._push_loop())
        logger.info(f"Uploader started → {self.config.cloud_url}")

    async def stop(self) -> None:
        """Stop the push loop and close HTTP session."""
        self._running = False
        if self._push_task:
            self._push_task.cancel()
            try:
                await self._push_task
            except asyncio.CancelledError:
                pass
            self._push_task = None

        if self._session:
            await self._session.close()
            self._session = None

        logger.info("Uploader stopped")

    @property
    def is_healthy(self) -> bool:
        return self._consecutive_failures < self.config.max_retry_attempts

    async def _push_loop(self) -> None:
        """Main push loop — dequeues batches and uploads."""
        while self._running:
            try:
                batch = self.buffer.dequeue(self.config.batch_size)

                if not batch:
                    await asyncio.sleep(self.config.push_interval_s)
                    continue

                ids = [row_id for row_id, _ in batch]
                records = [record for _, record in batch]

                success = await self._push_batch(records)

                if success:
                    self.buffer.ack(ids)
                    self._consecutive_failures = 0
                    logger.info(f"Pushed {len(records)} records")
                else:
                    self.buffer.nack(ids)
                    self._consecutive_failures += 1
                    delay = self._backoff_delay()
                    logger.warning(
                        f"Push failed (attempt {self._consecutive_failures}), "
                        f"retrying in {delay:.1f}s"
                    )
                    await asyncio.sleep(delay)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Push loop error: {e}")
                await asyncio.sleep(self.config.push_interval_s)

    async def _push_batch(self, records: list[dict]) -> bool:
        """Push a batch of records to the cloud API. Returns True on success."""
        if not self._session:
            return False

        path = "/api/v2/telemetry/ingest"
        url = self.config.cloud_url.rstrip("/") + path

        payload = {
            "organization_id": self.config.organization_id,
            "records": records,
        }
        body = json.dumps(payload).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "X-Organization-ID": self.config.organization_id,
        }

        if self.config.api_key:
            signature, timestamp = _sign_request(
                self.config.api_key, "POST", path, body
            )
            headers["X-HMAC-Signature"] = signature
            headers["X-HMAC-Timestamp"] = timestamp

        try:
            async with self._session.post(
                url, data=body, headers=headers, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status in (200, 201, 202):
                    return True
                else:
                    text = await resp.text()
                    logger.warning(f"Cloud API returned {resp.status}: {text[:200]}")
                    return False
        except aiohttp.ClientError as e:
            logger.warning(f"HTTP error: {e}")
            return False
        except asyncio.TimeoutError:
            logger.warning("Push request timed out")
            return False

    def _backoff_delay(self) -> float:
        """Exponential backoff with jitter, capped at retry_max_delay_s."""
        delay = self.config.retry_base_delay_s * (2 ** self._consecutive_failures)
        return min(delay, self.config.retry_max_delay_s)
