/**
 * CoT-to-Session Actor Bridge
 *
 * Maps incoming CoT events to session actors by UID.
 * Forwards operator positions to the Python backend and broadcasts via WebSocket.
 */

import log from 'electron-log';
import type { CotEvent } from './cot-parser';

const PYTHON_BASE = 'http://127.0.0.1:8083';

interface ActorMapping {
  actorId: string;
  sessionId: string;
  cotUid: string;
  name: string;
}

type BroadcastFn = (msg: { type: string; data: unknown }) => void;

export class CotActorBridge {
  private uidToActor = new Map<string, ActorMapping>();
  private activeSessionId: string | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastFn: BroadcastFn | null = null;
  // Throttle: at most one position update per actor per N ms
  private lastForwardedAt = new Map<string, number>();
  private throttleMs = 1000;

  /**
   * Set the WebSocket broadcast function for real-time updates.
   */
  setBroadcast(fn: BroadcastFn): void {
    this.broadcastFn = fn;
  }

  /**
   * Set the active session ID and refresh actor mappings.
   */
  async setActiveSession(sessionId: string | null): Promise<void> {
    this.activeSessionId = sessionId;
    this.uidToActor.clear();
    this.lastForwardedAt.clear();

    if (sessionId) {
      await this.refreshActorMappings();
      // Auto-refresh every 30s while session is active
      this.stopAutoRefresh();
      this.refreshInterval = setInterval(() => {
        this.refreshActorMappings().catch(() => {});
      }, 30000);
    } else {
      this.stopAutoRefresh();
    }
  }

  /**
   * Process a batch of CoT events. Matches UIDs against known session actors.
   */
  processCotEvents(events: CotEvent[]): void {
    if (!this.activeSessionId || this.uidToActor.size === 0) return;

    const now = Date.now();

    for (const event of events) {
      const actor = this.uidToActor.get(event.uid);
      if (!actor) continue;

      // Throttle per-actor
      const lastTime = this.lastForwardedAt.get(actor.actorId) || 0;
      if (now - lastTime < this.throttleMs) continue;
      this.lastForwardedAt.set(actor.actorId, now);

      this.forwardOperatorPosition(actor, event);
    }
  }

  /**
   * Stop auto-refresh and clean up.
   */
  stop(): void {
    this.stopAutoRefresh();
    this.uidToActor.clear();
    this.activeSessionId = null;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Fetch session actors with cot_uid from Python backend and build the lookup map.
   */
  private async refreshActorMappings(): Promise<void> {
    if (!this.activeSessionId) return;

    try {
      const resp = await fetch(
        `${PYTHON_BASE}/api/v2/sessions/${this.activeSessionId}/actors`
      );
      if (!resp.ok) return;

      const actors = (await resp.json()) as Array<{
        id: string;
        name: string;
        cot_uid?: string | null;
      }>;

      this.uidToActor.clear();
      for (const actor of actors) {
        if (actor.cot_uid) {
          this.uidToActor.set(actor.cot_uid, {
            actorId: actor.id,
            sessionId: this.activeSessionId!,
            cotUid: actor.cot_uid,
            name: actor.name,
          });
        }
      }

      if (this.uidToActor.size > 0) {
        log.debug(
          `[CoT Actor Bridge] Mapped ${this.uidToActor.size} actor(s) for session ${this.activeSessionId}`
        );
      }
    } catch (err) {
      log.warn('[CoT Actor Bridge] Failed to refresh actor mappings:', err);
    }
  }

  /**
   * Forward a CoT event as an operator position to the Python backend.
   */
  private async forwardOperatorPosition(
    actor: ActorMapping,
    event: CotEvent
  ): Promise<void> {
    const payload = {
      actor_id: actor.actorId,
      timestamp: event.timestamp,
      lat: event.lat,
      lon: event.lon,
      alt_m: event.alt_m,
      heading_deg: event.course_deg,
      speed_mps: event.speed_mps,
      gps_accuracy_m: event.ce,
      source: 'cot',
    };

    try {
      const resp = await fetch(
        `${PYTHON_BASE}/api/v2/sessions/${actor.sessionId}/operator-positions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (resp.ok) {
        // Broadcast position update to frontend
        this.broadcastFn?.({
          type: 'operator_updated',
          data: {
            actor_id: actor.actorId,
            session_id: actor.sessionId,
            name: actor.name,
            lat: event.lat,
            lon: event.lon,
            alt_m: event.alt_m,
            heading_deg: event.course_deg,
            speed_mps: event.speed_mps,
            timestamp: event.timestamp,
          },
        });
      }
    } catch {
      // Silently drop — CoT is best-effort
    }
  }
}

// Singleton
export const cotActorBridge = new CotActorBridge();
