import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateManager } from '../../src/core/state';
import { TrackerRecord } from '../../src/core/models';

function makeRecord(overrides: Partial<TrackerRecord> = {}): TrackerRecord {
  return {
    tracker_id: 'test1',
    time_local_received: new Date().toISOString(),
    time_gps: null,
    time_received: null,
    lat: 38.844,
    lon: -77.075,
    alt_m: 100,
    speed_mps: 5.0,
    course_deg: 90,
    hdop: 1.2,
    satellites: 8,
    rssi_dbm: -85,
    baro_alt_m: null,
    baro_temp_c: null,
    baro_press_hpa: null,
    fix_valid: true,
    battery_mv: null,
    latency_ms: null,
    ...overrides,
  };
}

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager(60);
  });

  afterEach(() => {
    manager.stop();
  });

  it('creates new tracker state on first record', () => {
    manager.updateTracker(makeRecord());

    expect(manager.getTrackerCount()).toBe(1);
    const state = manager.getTracker('test1');
    expect(state).toBeDefined();
    expect(state!.tracker_id).toBe('test1');
    expect(state!.lat).toBeCloseTo(38.844);
    expect(state!.fix_valid).toBe(true);
  });

  it('updates existing tracker state', () => {
    manager.updateTracker(makeRecord({ lat: 38.0 }));
    manager.updateTracker(makeRecord({ lat: 39.0 }));

    expect(manager.getTrackerCount()).toBe(1);
    expect(manager.getTracker('test1')!.lat).toBeCloseTo(39.0);
  });

  it('preserves last known position when fix becomes invalid', () => {
    manager.updateTracker(makeRecord({ lat: 38.844, lon: -77.075, fix_valid: true }));
    manager.updateTracker(makeRecord({ lat: null, lon: null, fix_valid: false }));

    const state = manager.getTracker('test1')!;
    expect(state.fix_valid).toBe(false);
    expect(state.last_known_lat).toBeCloseTo(38.844);
    expect(state.last_known_lon).toBeCloseTo(-77.075);
  });

  it('detects low battery', () => {
    manager.updateTracker(makeRecord({ battery_mv: 3200 }));
    expect(manager.getTracker('test1')!.low_battery).toBe(true);
    expect(manager.getTracker('test1')!.battery_critical).toBe(false);
  });

  it('detects critical battery', () => {
    manager.updateTracker(makeRecord({ battery_mv: 2900 }));
    expect(manager.getTracker('test1')!.battery_critical).toBe(true);
  });

  it('calls onTrackerUpdated callback', () => {
    const cb = vi.fn();
    manager = new StateManager(60, cb);
    manager.updateTracker(makeRecord());

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].tracker_id).toBe('test1');
  });

  it('returns sorted tracker summaries', () => {
    manager.updateTracker(makeRecord({ tracker_id: 'zz_tracker' }));
    manager.updateTracker(makeRecord({ tracker_id: 'aa_tracker' }));

    const summaries = manager.getTrackerSummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0].tracker_id).toBe('aa_tracker');
    expect(summaries[1].tracker_id).toBe('zz_tracker');
  });

  it('clears all trackers', () => {
    manager.updateTracker(makeRecord({ tracker_id: 'a' }));
    manager.updateTracker(makeRecord({ tracker_id: 'b' }));
    expect(manager.getTrackerCount()).toBe(2);

    manager.clearAll();
    expect(manager.getTrackerCount()).toBe(0);
  });
});
