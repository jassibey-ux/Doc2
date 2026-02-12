import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import { DashboardApp } from '../app';
import { CSVParser } from '../../core/parser';
import { NMEAParser } from '../../core/nmea-parser';
import { KMLImporter } from '../../core/kml-import';

const upload = multer({ storage: multer.memoryStorage() });

export function uploadRoutes(app: DashboardApp): Router {
  const router = Router();

  router.post('/upload/files', upload.array('files'), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.json({ processed: 0, errors: ['No files uploaded'], trackers_found: [] });
      return;
    }

    const csvParser = new CSVParser();
    const nmeaParser = new NMEAParser();
    const kmlImporter = new KMLImporter();

    const result = { processed: 0, errors: [] as string[], trackers_found: [] as string[] };
    const trackersSet = new Set<string>();

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      let records: any[] = [];

      try {
        const content = file.buffer.toString('utf-8');

        switch (ext) {
          case '.nmea':
            records = nmeaParser.parseNMEAContent(content);
            break;
          case '.csv':
            records = csvParser.parseCSVContent(content);
            break;
          case '.kml':
            records = await kmlImporter.parseKMLContent(content);
            break;
          case '.kmz':
            records = await kmlImporter.parseKMZFile(file.buffer);
            break;
          default:
            result.errors.push(`Unsupported file type: ${file.originalname}`);
            continue;
        }

        for (const record of records) {
          app.stateManager.updateTracker(record);
          trackersSet.add(record.tracker_id);
        }
        result.processed += records.length;
      } catch (e: any) {
        result.errors.push(`Error processing ${file.originalname}: ${e.message}`);
      }
    }

    result.trackers_found = Array.from(trackersSet);

    // Broadcast update
    if (trackersSet.size > 0) {
      app.broadcastMessage({
        type: 'tracker_updated' as any,
        data: { processed: result.processed, trackers_found: result.trackers_found },
      });
    }

    res.json(result);
  });

  return router;
}
