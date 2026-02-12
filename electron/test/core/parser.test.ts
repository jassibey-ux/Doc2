import { describe, it, expect } from 'vitest';
import { CSVParser } from '../../src/core/parser';

describe('CSVParser', () => {
  it('parses basic CSV with standard headers', () => {
    const content = `tracker_id,time,lat,lon,alt_m,fix_valid
device1,2024-01-15T10:30:00,38.844,-77.075,100.5,true
device2,2024-01-15T10:30:01,38.845,-77.076,101.0,true`;

    const parser = new CSVParser();
    const records = parser.parseCSVContent(content);

    expect(records).toHaveLength(2);
    expect(records[0].tracker_id).toBe('device1');
    expect(records[0].lat).toBeCloseTo(38.844);
    expect(records[0].lon).toBeCloseTo(-77.075);
    expect(records[0].alt_m).toBeCloseTo(100.5);
    expect(records[0].fix_valid).toBe(true);
    expect(records[1].tracker_id).toBe('device2');
  });

  it('handles alternative column names', () => {
    const content = `report_stationid,measurement_datetime,gps_lat,gps_lon,gps_alt,gps_fixvalid,rf_rssi
station1,2024-01-15 10:30:00,38.844,-77.075,100.5,1,-85`;

    const parser = new CSVParser();
    const records = parser.parseCSVContent(content);

    expect(records).toHaveLength(1);
    expect(records[0].tracker_id).toBe('station1');
    expect(records[0].rssi_dbm).toBe(-85);
  });

  it('handles missing/empty fields gracefully', () => {
    const content = `tracker_id,time,lat,lon
device1,2024-01-15T10:30:00,,
device1,2024-01-15T10:30:01,38.844,-77.075`;

    const parser = new CSVParser();
    const records = parser.parseCSVContent(content);

    expect(records).toHaveLength(2);
    expect(records[0].lat).toBeNull();
    expect(records[0].lon).toBeNull();
    expect(records[1].lat).toBeCloseTo(38.844);
  });

  it('parses battery voltage', () => {
    const content = `tracker_id,time,battery_mv,fix_valid
device1,2024-01-15T10:30:00,3850,true`;

    const parser = new CSVParser();
    const records = parser.parseCSVContent(content);

    expect(records).toHaveLength(1);
    expect(records[0].battery_mv).toBe(3850);
  });

  it('returns empty array for empty content', () => {
    const parser = new CSVParser();
    expect(parser.parseCSVContent('')).toHaveLength(0);
    expect(parser.parseCSVContent('just_header\n')).toHaveLength(0);
  });

  it('handles quoted CSV fields', () => {
    const content = `tracker_id,time,lat,lon
"device 1","2024-01-15T10:30:00",38.844,-77.075`;

    const parser = new CSVParser();
    const records = parser.parseCSVContent(content);

    expect(records).toHaveLength(1);
    expect(records[0].tracker_id).toBe('device 1');
  });
});
