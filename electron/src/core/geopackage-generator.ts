/**
 * GeoPackage Generator — Creates OGC GeoPackage (.gpkg) files from GeoJSON
 *
 * Implements the OGC GeoPackage Encoding Standard (v1.3) using better-sqlite3.
 * Uses GeoPackage Binary (GPB) geometry encoding as required by the spec.
 *
 * The GPB format wraps standard WKB with a header:
 *   - Magic: 0x47, 0x50 ("GP")
 *   - Version: 0x00
 *   - Flags: byte encoding endianness, envelope type, empty flag
 *   - SRS ID: 4-byte integer (4326 for WGS84)
 *   - Envelope: optional bounding box (we use type 1 = [minX, maxX, minY, maxY])
 *   - WKB: standard Well-Known Binary geometry
 */

import Database from 'better-sqlite3';
import log from 'electron-log';

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// --- WKB Encoding ---

function writeDouble(buf: Buffer, offset: number, value: number): void {
  buf.writeDoubleLE(value, offset);
}

function writeUInt32(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt32LE(value, offset);
}

/**
 * Encode a Point geometry as WKB (Little Endian).
 */
function encodePointWKB(coords: number[]): Buffer {
  const hasZ = coords.length >= 3;
  const wkbType = hasZ ? 1001 : 1; // Point Z or Point
  const buf = Buffer.alloc(1 + 4 + (hasZ ? 24 : 16));
  let offset = 0;

  buf.writeUInt8(1, offset); offset += 1; // Little Endian
  writeUInt32(buf, offset, wkbType); offset += 4;
  writeDouble(buf, offset, coords[0]); offset += 8; // X (lon)
  writeDouble(buf, offset, coords[1]); offset += 8; // Y (lat)
  if (hasZ) {
    writeDouble(buf, offset, coords[2]); offset += 8; // Z (alt)
  }

  return buf;
}

/**
 * Encode a LineString geometry as WKB (Little Endian).
 */
function encodeLineStringWKB(coords: number[][]): Buffer {
  const hasZ = coords.length > 0 && coords[0].length >= 3;
  const wkbType = hasZ ? 1002 : 2;
  const pointSize = hasZ ? 24 : 16;
  const buf = Buffer.alloc(1 + 4 + 4 + coords.length * pointSize);
  let offset = 0;

  buf.writeUInt8(1, offset); offset += 1;
  writeUInt32(buf, offset, wkbType); offset += 4;
  writeUInt32(buf, offset, coords.length); offset += 4;

  for (const coord of coords) {
    writeDouble(buf, offset, coord[0]); offset += 8;
    writeDouble(buf, offset, coord[1]); offset += 8;
    if (hasZ) {
      writeDouble(buf, offset, coord[2] ?? 0); offset += 8;
    }
  }

  return buf;
}

/**
 * Encode a Polygon geometry as WKB (Little Endian).
 */
function encodePolygonWKB(rings: number[][][]): Buffer {
  const hasZ = rings.length > 0 && rings[0].length > 0 && rings[0][0].length >= 3;
  const wkbType = hasZ ? 1003 : 3;
  const pointSize = hasZ ? 24 : 16;

  // Calculate total size
  let totalPoints = 0;
  for (const ring of rings) totalPoints += ring.length;
  const buf = Buffer.alloc(1 + 4 + 4 + rings.length * 4 + totalPoints * pointSize);
  let offset = 0;

  buf.writeUInt8(1, offset); offset += 1;
  writeUInt32(buf, offset, wkbType); offset += 4;
  writeUInt32(buf, offset, rings.length); offset += 4;

  for (const ring of rings) {
    writeUInt32(buf, offset, ring.length); offset += 4;
    for (const coord of ring) {
      writeDouble(buf, offset, coord[0]); offset += 8;
      writeDouble(buf, offset, coord[1]); offset += 8;
      if (hasZ) {
        writeDouble(buf, offset, coord[2] ?? 0); offset += 8;
      }
    }
  }

  return buf;
}

/**
 * Encode a GeoJSON geometry as WKB.
 */
function encodeGeometryWKB(geometry: { type: string; coordinates: any }): Buffer {
  switch (geometry.type) {
    case 'Point':
      return encodePointWKB(geometry.coordinates);
    case 'LineString':
      return encodeLineStringWKB(geometry.coordinates);
    case 'Polygon':
      return encodePolygonWKB(geometry.coordinates);
    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

// --- GPB (GeoPackage Binary) Encoding ---

/**
 * Compute the bounding envelope of a geometry.
 */
function computeEnvelope(geometry: { type: string; coordinates: any }): [number, number, number, number] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  function processCoord(coord: number[]) {
    if (coord[0] < minX) minX = coord[0];
    if (coord[0] > maxX) maxX = coord[0];
    if (coord[1] < minY) minY = coord[1];
    if (coord[1] > maxY) maxY = coord[1];
  }

  function processCoords(coords: any, depth: number) {
    if (depth === 0) {
      processCoord(coords);
    } else {
      for (const c of coords) {
        processCoords(c, depth - 1);
      }
    }
  }

  switch (geometry.type) {
    case 'Point': processCoords(geometry.coordinates, 0); break;
    case 'LineString': processCoords(geometry.coordinates, 1); break;
    case 'Polygon': processCoords(geometry.coordinates, 2); break;
  }

  return [minX, maxX, minY, maxY];
}

/**
 * Check if a geometry has zero coordinates (empty).
 */
function isEmptyGeometry(geometry: { type: string; coordinates: any }): boolean {
  const coords = geometry.coordinates;
  if (coords == null) return true;
  if (geometry.type === 'Point') return coords.length === 0;
  if (geometry.type === 'LineString') return coords.length === 0;
  if (geometry.type === 'Polygon') return coords.length === 0 || coords[0].length === 0;
  return true;
}

/**
 * Wrap WKB in a GeoPackage Binary (GPB) header.
 * GPB format: magic(2) + version(1) + flags(1) + srs_id(4) + [envelope] + wkb
 */
function encodeGPB(geometry: { type: string; coordinates: any }, srsId: number = 4326): Buffer {
  const wkb = encodeGeometryWKB(geometry);
  const empty = isEmptyGeometry(geometry);

  if (empty) {
    // Empty geometry: no envelope, set empty flag
    const headerSize = 2 + 1 + 1 + 4; // 8 bytes (no envelope)
    const gpb = Buffer.alloc(headerSize + wkb.length);
    let offset = 0;
    gpb.writeUInt8(0x47, offset); offset += 1; // 'G'
    gpb.writeUInt8(0x50, offset); offset += 1; // 'P'
    gpb.writeUInt8(0x00, offset); offset += 1; // version
    // Flags: empty=1, no envelope (0), little-endian
    const flags = 0b00100010; // bit 1 = empty, bit 5 = little-endian
    gpb.writeUInt8(flags, offset); offset += 1;
    gpb.writeInt32LE(srsId, offset); offset += 4;
    wkb.copy(gpb, offset);
    return gpb;
  }

  const [minX, maxX, minY, maxY] = computeEnvelope(geometry);

  // Envelope type 1: [minX, maxX, minY, maxY] = 4 doubles = 32 bytes
  const headerSize = 2 + 1 + 1 + 4 + 32; // 40 bytes
  const gpb = Buffer.alloc(headerSize + wkb.length);
  let offset = 0;

  // Magic number: "GP"
  gpb.writeUInt8(0x47, offset); offset += 1;
  gpb.writeUInt8(0x50, offset); offset += 1;

  // Version: 0
  gpb.writeUInt8(0x00, offset); offset += 1;

  // Flags byte:
  // bit 0: binary_type (0 = standard)
  // bit 1: empty geometry (0 = not empty)
  // bits 2-3-4: envelope contents indicator (001 = type 1, minX/maxX/minY/maxY)
  // bit 5: endianness (1 = little-endian)
  // bits 6-7: reserved
  const flags = 0b00100100; // little-endian, envelope type 1
  gpb.writeUInt8(flags, offset); offset += 1;

  // SRS ID (little-endian)
  gpb.writeInt32LE(srsId, offset); offset += 4;

  // Envelope: minX, maxX, minY, maxY (little-endian doubles)
  gpb.writeDoubleLE(minX, offset); offset += 8;
  gpb.writeDoubleLE(maxX, offset); offset += 8;
  gpb.writeDoubleLE(minY, offset); offset += 8;
  gpb.writeDoubleLE(maxY, offset); offset += 8;

  // WKB payload
  wkb.copy(gpb, offset);

  return gpb;
}

// --- GeoPackage File Generation ---

/**
 * Map GeoJSON geometry type to GeoPackage geometry column type.
 */
function gpkgGeometryType(geojsonType: string): string {
  switch (geojsonType) {
    case 'Point': return 'POINT';
    case 'LineString': return 'LINESTRING';
    case 'Polygon': return 'POLYGON';
    default: return 'GEOMETRY';
  }
}

/**
 * Generate an OGC GeoPackage file from a GeoJSON FeatureCollection.
 * Returns the file as a Buffer.
 */
/**
 * Check if the native better-sqlite3 module can be loaded in the current runtime.
 */
export function checkSqliteAvailability(): { ok: boolean; error?: string } {
  try {
    const db = new Database(':memory:');
    db.close();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

interface AIAnalysisData {
  executive_summary: string;
  operational_assessment: string;
  analysis_json: string;
}

export function generateGeoPackage(
  featureCollection: GeoJSONFeatureCollection,
  sessionName: string,
  aiAnalysis?: AIAnalysisData,
): Buffer {
  // Group features by feature_type for separate tables
  const layerGroups = new Map<string, GeoJSONFeature[]>();
  for (const feature of featureCollection.features) {
    const featureType = (feature.properties.feature_type as string) || 'unknown';
    if (!layerGroups.has(featureType)) {
      layerGroups.set(featureType, []);
    }
    layerGroups.get(featureType)!.push(feature);
  }

  // Create in-memory SQLite database
  const db = new Database(':memory:');

  try {
    // Set GeoPackage application ID
    db.pragma('application_id = 0x47504B47'); // "GPKG"
    db.pragma('user_version = 10300'); // GeoPackage version 1.3.0

    // Create required GeoPackage metadata tables
    db.exec(`
      CREATE TABLE gpkg_spatial_ref_sys (
        srs_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL PRIMARY KEY,
        organization TEXT NOT NULL,
        organization_coordsys_id INTEGER NOT NULL,
        definition TEXT NOT NULL,
        description TEXT
      );

      INSERT INTO gpkg_spatial_ref_sys VALUES
        ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'),
        ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'),
        ('WGS 84 geodetic', 4326, 'EPSG', 4326,
         'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]',
         'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid');

      CREATE TABLE gpkg_contents (
        table_name TEXT NOT NULL PRIMARY KEY,
        data_type TEXT NOT NULL DEFAULT 'features',
        identifier TEXT UNIQUE,
        description TEXT DEFAULT '',
        last_change TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        min_x DOUBLE,
        min_y DOUBLE,
        max_x DOUBLE,
        max_y DOUBLE,
        srs_id INTEGER,
        CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
      );

      CREATE TABLE gpkg_geometry_columns (
        table_name TEXT NOT NULL,
        column_name TEXT NOT NULL,
        geometry_type_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL,
        z TINYINT NOT NULL,
        m TINYINT NOT NULL,
        CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
        CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
        CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
      );
    `);

    // Create a table for each feature type layer
    for (const [featureType, features] of layerGroups) {
      if (features.length === 0) continue;

      const tableName = featureType.replace(/[^a-zA-Z0-9_]/g, '_');
      const geomType = gpkgGeometryType(features[0].geometry.type);

      // Collect all property keys across features in this layer
      const propKeys = new Set<string>();
      for (const f of features) {
        for (const key of Object.keys(f.properties)) {
          if (key !== 'feature_type') propKeys.add(key);
        }
      }

      // Create the feature table
      const columns = ['fid INTEGER PRIMARY KEY AUTOINCREMENT', 'geom BLOB'];
      for (const key of propKeys) {
        const safeName = key.replace(/[^a-zA-Z0-9_]/g, '_');
        // Infer column type from first non-null value
        let colType = 'TEXT';
        for (const f of features) {
          const val = f.properties[key];
          if (val != null) {
            if (typeof val === 'number') {
              colType = Number.isInteger(val) ? 'INTEGER' : 'REAL';
            } else if (typeof val === 'boolean') {
              colType = 'INTEGER'; // SQLite has no boolean
            }
            break;
          }
        }
        columns.push(`"${safeName}" ${colType}`);
      }

      db.exec(`CREATE TABLE "${tableName}" (${columns.join(', ')})`);

      // Compute layer envelope
      let layerMinX = Infinity, layerMaxX = -Infinity;
      let layerMinY = Infinity, layerMaxY = -Infinity;
      let hasZ = false;

      // Insert features
      const propKeysArray = Array.from(propKeys);
      const placeholders = ['?', ...propKeysArray.map(() => '?')].join(', ');
      const colNames = ['"geom"', ...propKeysArray.map(k => `"${k.replace(/[^a-zA-Z0-9_]/g, '_')}"`)].join(', ');
      const insertStmt = db.prepare(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`);

      const insertMany = db.transaction((feats: GeoJSONFeature[]) => {
        for (const feat of feats) {
          try {
            const gpb = encodeGPB(feat.geometry, 4326);
            const [minX, maxX, minY, maxY] = computeEnvelope(feat.geometry);
            if (minX < layerMinX) layerMinX = minX;
            if (maxX > layerMaxX) layerMaxX = maxX;
            if (minY < layerMinY) layerMinY = minY;
            if (maxY > layerMaxY) layerMaxY = maxY;

            // Check for Z coordinates
            if (!hasZ) {
              const coords = feat.geometry.coordinates;
              if (feat.geometry.type === 'Point' && coords.length >= 3) hasZ = true;
              else if (feat.geometry.type === 'LineString' && coords.length > 0 && coords[0].length >= 3) hasZ = true;
              else if (feat.geometry.type === 'Polygon' && coords.length > 0 && coords[0].length > 0 && coords[0][0].length >= 3) hasZ = true;
            }

            const values: any[] = [gpb];
            for (const key of propKeysArray) {
              let val = feat.properties[key];
              if (val === undefined || val === null) {
                values.push(null);
              } else if (typeof val === 'boolean') {
                values.push(val ? 1 : 0);
              } else {
                values.push(val);
              }
            }

            insertStmt.run(...values);
          } catch (err: any) {
            log.warn(`[GeoPackage] Skipping feature: ${err.message}`);
          }
        }
      });

      insertMany(features);

      // Register in gpkg_contents
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
        VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?, 4326)
      `).run(
        tableName,
        tableName,
        `${sessionName} - ${featureType}`,
        now,
        isFinite(layerMinX) ? layerMinX : null,
        isFinite(layerMinY) ? layerMinY : null,
        isFinite(layerMaxX) ? layerMaxX : null,
        isFinite(layerMaxY) ? layerMaxY : null,
      );

      // Register geometry column
      db.prepare(`
        INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
        VALUES (?, 'geom', ?, 4326, ?, 0)
      `).run(tableName, geomType, hasZ ? 1 : 0);

      log.info(`[GeoPackage] Created layer "${tableName}" with ${features.length} features`);
    }

    // Add AI analysis non-spatial table if data provided
    if (aiAnalysis) {
      db.exec(`
        CREATE TABLE "session_analysis" (
          fid INTEGER PRIMARY KEY AUTOINCREMENT,
          executive_summary TEXT,
          operational_assessment TEXT,
          analysis_json TEXT
        )
      `);

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, srs_id)
        VALUES (?, 'attributes', ?, ?, ?, 4326)
      `).run('session_analysis', 'session_analysis', `${sessionName} - AI Analysis`, now);

      db.prepare(`
        INSERT INTO "session_analysis" (executive_summary, operational_assessment, analysis_json)
        VALUES (?, ?, ?)
      `).run(aiAnalysis.executive_summary, aiAnalysis.operational_assessment, aiAnalysis.analysis_json);

      log.info('[GeoPackage] Added session_analysis table with AI analysis data');
    }

    // Serialize the database to a Buffer
    const buffer = db.serialize();
    log.info(`[GeoPackage] Generated ${buffer.length} bytes for "${sessionName}"`);
    return Buffer.from(buffer);
  } finally {
    db.close();
  }
}
