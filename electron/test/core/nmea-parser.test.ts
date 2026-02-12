import { describe, it, expect } from 'vitest';
import { NMEAParser } from '../../src/core/nmea-parser';

describe('NMEAParser', () => {
  it('parses a complete message block', () => {
    const content = `$RFMSGFROM,device1,0,0*
$GPGGA,053401.500,3850.6831,N,07704.5878,W,1,04,07.4,09.5,M,-34.0,M,0,0*6D
$GPRMC,053401.500,A,3850.6831,N,07704.5878,W,000.0,000.0,180126,,,A*72
$HRFSSI,-85*
$BATMV,3850*
$BAROALT,101325,22.5,0*
$RXTIMESTAMP,2026,1,18,5,34,1.500*
$RFMSGEND*`;

    const parser = new NMEAParser();
    const records = parser.parseNMEAContent(content);

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.tracker_id).toBe('device1');
    expect(r.lat).toBeCloseTo(38.844718, 3);
    expect(r.lon).toBeCloseTo(-77.076463, 3);
    expect(r.alt_m).toBeCloseTo(9.5);
    expect(r.rssi_dbm).toBe(-85);
    expect(r.battery_mv).toBe(3850);
    expect(r.fix_valid).toBe(true);
    expect(r.satellites).toBe(4);
  });

  it('parses multiple message blocks', () => {
    const content = `$RFMSGFROM,dev1*
$GPSLAT,38.844*
$GPSLON,-77.075*
$GPSFIX,1*
$RFMSGEND*
$RFMSGFROM,dev2*
$GPSLAT,39.0*
$GPSLON,-76.0*
$GPSFIX,1*
$RFMSGEND*`;

    const parser = new NMEAParser();
    const records = parser.parseNMEAContent(content);

    expect(records).toHaveLength(2);
    expect(records[0].tracker_id).toBe('dev1');
    expect(records[1].tracker_id).toBe('dev2');
  });

  it('handles incomplete blocks gracefully', () => {
    const content = `$RFMSGFROM,dev1*
$GPSLAT,38.844*
$GPSLON,-77.075*`;
    // No RFMSGEND

    const parser = new NMEAParser();
    const records = parser.parseNMEAContent(content);

    expect(records).toHaveLength(0);
  });

  it('converts NMEA coordinates correctly', () => {
    // NMEA format: DDDMM.MMMM
    const content = `$RFMSGFROM,dev1*
$GPGGA,120000.000,4807.038,N,01131.000,E,1,08,0.9,545.4,M,47.0,M,,*47
$RFMSGEND*`;

    const parser = new NMEAParser();
    const records = parser.parseNMEAContent(content);

    expect(records).toHaveLength(1);
    // 48 degrees 07.038 minutes = 48 + 7.038/60 = 48.1173
    expect(records[0].lat).toBeCloseTo(48.1173, 3);
    // 011 degrees 31.000 minutes = 11 + 31/60 = 11.5167
    expect(records[0].lon).toBeCloseTo(11.5167, 3);
  });

  it('parses speed from GPRMC (knots to m/s)', () => {
    const content = `$RFMSGFROM,dev1*
$GPRMC,120000.000,A,3850.0000,N,07700.0000,W,10.0,090.0,180126,,,A*
$RFMSGEND*`;

    const parser = new NMEAParser();
    const records = parser.parseNMEAContent(content);

    expect(records).toHaveLength(1);
    // 10 knots * 0.514444 = 5.14444 m/s
    expect(records[0].speed_mps).toBeCloseTo(5.14444, 3);
    expect(records[0].course_deg).toBe(90.0);
  });
});
