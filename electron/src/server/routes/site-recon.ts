/**
 * Site Recon Routes — manage 3D site reconnaissance screenshots.
 */
import { Router } from 'express';
import * as path from 'path';
import {
  getReconData,
  saveReconImage,
  getReconImagePath,
  deleteRecon,
} from '../../core/site-recon-store';

export function siteReconRoutes(): Router {
  const router = Router();

  // GET /api/site-recon/:siteId — get metadata + image list
  router.get('/site-recon/:siteId', (req, res) => {
    try {
      const data = getReconData(req.params.siteId);
      if (!data) {
        return res.json({ siteId: req.params.siteId, captures: [], status: 'none' });
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get recon data' });
    }
  });

  // PUT /api/site-recon/:siteId/image — save screenshot (base64 body)
  router.put('/site-recon/:siteId/image', (req, res) => {
    try {
      const { captureId, label, base64, cameraState } = req.body;
      if (!captureId || !label || !base64 || !cameraState) {
        return res.status(400).json({ error: 'Missing captureId, label, base64, or cameraState' });
      }
      const meta = saveReconImage(req.params.siteId, captureId, label, base64, cameraState);
      res.json(meta);
    } catch (err) {
      res.status(500).json({ error: 'Failed to save recon image' });
    }
  });

  // GET /api/site-recon/:siteId/images/:captureId — serve image file
  router.get('/site-recon/:siteId/images/:captureId', (req, res) => {
    try {
      const imgPath = getReconImagePath(req.params.siteId, req.params.captureId);
      if (!imgPath) {
        return res.status(404).json({ error: 'Image not found' });
      }
      res.sendFile(path.resolve(imgPath));
    } catch (err) {
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });

  // DELETE /api/site-recon/:siteId — clear cache
  router.delete('/site-recon/:siteId', (req, res) => {
    try {
      const deleted = deleteRecon(req.params.siteId);
      res.json({ deleted });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete recon data' });
    }
  });

  return router;
}
