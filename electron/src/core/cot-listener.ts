/**
 * CoT (Cursor on Target) UDP Listener
 * Receives CoT XML messages on a configurable UDP port and parses them
 * into structured detection events.
 */

import * as dgram from 'dgram';
import log from 'electron-log';
import { CotEvent, parseCotXml, parseCotBuffer } from './cot-parser';

// =============================================================================
// Types
// =============================================================================

export type CotEventCallback = (events: CotEvent[]) => void;

export interface CotListenerOptions {
  port: number;
  bindAddress?: string;       // Default '0.0.0.0' to listen on all interfaces
  multicastGroup?: string;    // Optional multicast group to join (e.g. '239.2.3.1')
  bufferSize?: number;        // UDP receive buffer size (default 65536)
}

export interface CotListenerStats {
  running: boolean;
  port: number;
  bind_address: string;
  messages_received: number;
  events_parsed: number;
  parse_errors: number;
  bytes_received: number;
  started_at: string | null;
  last_message_at: string | null;
}

// =============================================================================
// CoT UDP Listener
// =============================================================================

export class CotListener {
  private socket: dgram.Socket | null = null;
  private running = false;
  private options: Required<Omit<CotListenerOptions, 'multicastGroup'>> & { multicastGroup?: string };
  private callback: CotEventCallback;

  // Stats
  private messagesReceived = 0;
  private eventsParsed = 0;
  private parseErrors = 0;
  private bytesReceived = 0;
  private startedAt: string | null = null;
  private lastMessageAt: string | null = null;

  constructor(options: CotListenerOptions, callback: CotEventCallback) {
    this.options = {
      port: options.port,
      bindAddress: options.bindAddress || '0.0.0.0',
      bufferSize: options.bufferSize || 65536,
      multicastGroup: options.multicastGroup,
    };
    this.callback = callback;
  }

  /**
   * Start listening for CoT messages on the configured UDP port.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.running) {
        log.warn('[CoT Listener] Already running');
        resolve();
        return;
      }

      try {
        this.socket = dgram.createSocket({
          type: 'udp4',
          reuseAddr: true,
        });

        // Set receive buffer size
        this.socket.on('listening', () => {
          const address = this.socket!.address();
          log.info(`[CoT Listener] Listening on ${address.address}:${address.port}`);

          try {
            this.socket!.setRecvBufferSize(this.options.bufferSize);
          } catch (err) {
            log.warn('[CoT Listener] Could not set receive buffer size:', err);
          }

          // Join multicast group if specified
          if (this.options.multicastGroup) {
            try {
              this.socket!.addMembership(this.options.multicastGroup);
              log.info(`[CoT Listener] Joined multicast group: ${this.options.multicastGroup}`);
            } catch (err) {
              log.error('[CoT Listener] Failed to join multicast group:', err);
            }
          }

          this.running = true;
          this.startedAt = new Date().toISOString();
          this.resetStats();

          resolve();
        });

        // Handle incoming messages
        this.socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
          this.handleMessage(msg, rinfo);
        });

        // Handle errors
        this.socket.on('error', (err: Error) => {
          log.error(`[CoT Listener] Socket error:`, err);

          if (!this.running) {
            // Error during startup
            reject(err);
            return;
          }

          // Error during operation - try to keep running
          log.warn('[CoT Listener] Attempting to recover from error');
        });

        // Handle close
        this.socket.on('close', () => {
          log.info('[CoT Listener] Socket closed');
          this.running = false;
        });

        // Bind to port
        this.socket.bind(this.options.port, this.options.bindAddress);
      } catch (err) {
        log.error('[CoT Listener] Failed to create socket:', err);
        reject(err);
      }
    });
  }

  /**
   * Stop the listener and close the socket.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.running || !this.socket) {
        this.running = false;
        resolve();
        return;
      }

      log.info('[CoT Listener] Stopping...');

      // Leave multicast group if joined
      if (this.options.multicastGroup) {
        try {
          this.socket.dropMembership(this.options.multicastGroup);
        } catch {
          // Ignore errors when leaving multicast
        }
      }

      this.socket.close(() => {
        this.socket = null;
        this.running = false;
        log.info('[CoT Listener] Stopped');
        resolve();
      });
    });
  }

  /**
   * Check if the listener is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get listener statistics.
   */
  getStats(): CotListenerStats {
    return {
      running: this.running,
      port: this.options.port,
      bind_address: this.options.bindAddress,
      messages_received: this.messagesReceived,
      events_parsed: this.eventsParsed,
      parse_errors: this.parseErrors,
      bytes_received: this.bytesReceived,
      started_at: this.startedAt,
      last_message_at: this.lastMessageAt,
    };
  }

  /**
   * Update the callback function.
   */
  setCallback(callback: CotEventCallback): void {
    this.callback = callback;
  }

  /**
   * Update listen port. Requires restart.
   */
  getPort(): number {
    return this.options.port;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    this.messagesReceived++;
    this.bytesReceived += msg.length;
    this.lastMessageAt = new Date().toISOString();

    try {
      const xmlStr = msg.toString('utf-8');

      // Try parsing as a single event first
      let events: CotEvent[] = [];
      const singleEvent = parseCotXml(xmlStr);

      if (singleEvent) {
        events = [singleEvent];
      } else {
        // May contain multiple events (buffered UDP)
        events = parseCotBuffer(xmlStr);
      }

      if (events.length > 0) {
        this.eventsParsed += events.length;
        log.debug(
          `[CoT Listener] Parsed ${events.length} event(s) from ${rinfo.address}:${rinfo.port}`
        );
        this.callback(events);
      } else {
        this.parseErrors++;
        log.warn(
          `[CoT Listener] No valid events parsed from ${rinfo.address}:${rinfo.port} (${msg.length} bytes)`
        );
      }
    } catch (error) {
      this.parseErrors++;
      log.error(
        `[CoT Listener] Error processing message from ${rinfo.address}:${rinfo.port}:`,
        error
      );
    }
  }

  private resetStats(): void {
    this.messagesReceived = 0;
    this.eventsParsed = 0;
    this.parseErrors = 0;
    this.bytesReceived = 0;
    this.lastMessageAt = null;
  }
}
