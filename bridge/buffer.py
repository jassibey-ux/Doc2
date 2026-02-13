"""
SQLite Store-and-Forward Buffer

Provides reliable buffering of parsed CSV records before cloud push.
Survives network outages, process restarts, and power failures.
Records are stored in SQLite and removed only after successful upload.
"""

import json
import logging
import os
import sqlite3
import time
from typing import Optional

logger = logging.getLogger(__name__)


class BufferDB:
    """SQLite-backed store-and-forward buffer."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None

    def open(self) -> None:
        """Open the database and create tables if needed."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS buffer (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payload TEXT NOT NULL,
                created_at REAL NOT NULL,
                retry_count INTEGER DEFAULT 0,
                last_retry_at REAL DEFAULT 0
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_buffer_created
            ON buffer(created_at)
        """)
        self._conn.commit()
        logger.info(f"Buffer DB opened: {self.db_path}")

    def close(self) -> None:
        """Close the database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    def enqueue(self, records: list[dict]) -> int:
        """
        Add records to the buffer.

        Args:
            records: List of parsed record dicts.

        Returns:
            Number of records enqueued.
        """
        if not self._conn or not records:
            return 0

        now = time.time()
        rows = [(json.dumps(r), now) for r in records]
        self._conn.executemany(
            "INSERT INTO buffer (payload, created_at) VALUES (?, ?)",
            rows,
        )
        self._conn.commit()
        return len(rows)

    def dequeue(self, batch_size: int = 100) -> list[tuple[int, dict]]:
        """
        Fetch the oldest un-pushed records.

        Args:
            batch_size: Max records to return.

        Returns:
            List of (id, record_dict) tuples.
        """
        if not self._conn:
            return []

        cursor = self._conn.execute(
            "SELECT id, payload FROM buffer ORDER BY id ASC LIMIT ?",
            (batch_size,),
        )
        results = []
        for row_id, payload in cursor.fetchall():
            try:
                results.append((row_id, json.loads(payload)))
            except json.JSONDecodeError:
                logger.warning(f"Corrupt buffer row {row_id}, removing")
                self._conn.execute("DELETE FROM buffer WHERE id = ?", (row_id,))
        return results

    def ack(self, ids: list[int]) -> None:
        """Remove successfully pushed records from the buffer."""
        if not self._conn or not ids:
            return

        placeholders = ",".join("?" * len(ids))
        self._conn.execute(
            f"DELETE FROM buffer WHERE id IN ({placeholders})",
            ids,
        )
        self._conn.commit()

    def nack(self, ids: list[int]) -> None:
        """Mark records as failed (increment retry count)."""
        if not self._conn or not ids:
            return

        now = time.time()
        placeholders = ",".join("?" * len(ids))
        self._conn.execute(
            f"UPDATE buffer SET retry_count = retry_count + 1, last_retry_at = ? WHERE id IN ({placeholders})",
            [now] + ids,
        )
        self._conn.commit()

    def pending_count(self) -> int:
        """Return number of records waiting to be pushed."""
        if not self._conn:
            return 0
        cursor = self._conn.execute("SELECT COUNT(*) FROM buffer")
        return cursor.fetchone()[0]

    def purge_old(self, max_age_s: float = 86400 * 7) -> int:
        """Remove records older than max_age_s. Returns count removed."""
        if not self._conn:
            return 0

        cutoff = time.time() - max_age_s
        cursor = self._conn.execute(
            "DELETE FROM buffer WHERE created_at < ?", (cutoff,)
        )
        self._conn.commit()
        return cursor.rowcount
