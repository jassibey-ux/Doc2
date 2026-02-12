/**
 * Reports API Routes
 * Endpoints for generating PDF and DOCX reports
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import {
  getTestSessionById,
  updateTestSession,
  getSiteById,
  getDroneProfiles,
  getCUASProfiles,
} from '../../core/library-store';
import {
  generateHTMLReport,
  generateTextReport,
  saveHTMLReport,
  saveTextReport,
  generateReportFilename,
  ReportData,
  ReportOptions,
} from '../../core/report-generator';

// Allowed base directory for report output
const ALLOWED_REPORTS_BASE = path.join(process.cwd(), 'reports');

/**
 * Validate that a path is within an allowed directory (path traversal protection)
 */
function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(basePath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

export function reportsRoutes(): Router {
  const router = Router();

  /**
   * POST /api/reports/html
   * Generate HTML report for a test session
   */
  router.post('/reports/html', async (req: Request, res: Response) => {
    try {
      const { sessionId, options, mapImageBase64, chartImageBase64 } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      // Load session
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Load related data
      const site = session.site_id ? getSiteById(session.site_id) : undefined;
      const droneProfiles = new Map(
        getDroneProfiles().map(p => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map(p => [p.id, p])
      );

      // Build report data
      const reportData: ReportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles,
        mapImageBase64,
        chartImageBase64,
      };

      // Generate HTML
      const html = generateHTMLReport(reportData, options as ReportOptions);

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error: any) {
      log.error('Error generating HTML report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/reports/text
   * Generate plain text report for a test session
   */
  router.post('/reports/text', async (req: Request, res: Response) => {
    try {
      const { sessionId, options } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      // Load session
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Load related data
      const site = session.site_id ? getSiteById(session.site_id) : undefined;
      const droneProfiles = new Map(
        getDroneProfiles().map(p => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map(p => [p.id, p])
      );

      // Build report data
      const reportData: ReportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles,
      };

      // Generate text
      const text = generateTextReport(reportData, options as ReportOptions);

      res.setHeader('Content-Type', 'text/plain');
      res.send(text);
    } catch (error: any) {
      log.error('Error generating text report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/reports/save
   * Save report to file and return path
   */
  router.post('/reports/save', async (req: Request, res: Response) => {
    try {
      const { sessionId, format, options, mapImageBase64, chartImageBase64, outputDir } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      if (!format || !['html', 'txt'].includes(format)) {
        return res.status(400).json({ error: 'format must be "html" or "txt"' });
      }

      // Load session
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Load related data
      const site = session.site_id ? getSiteById(session.site_id) : undefined;
      const droneProfiles = new Map(
        getDroneProfiles().map(p => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map(p => [p.id, p])
      );

      // Build report data
      const reportData: ReportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles,
        mapImageBase64,
        chartImageBase64,
      };

      // Determine output directory with path traversal protection
      const dir = outputDir || ALLOWED_REPORTS_BASE;

      // Security: Validate path is within allowed directory
      if (!isPathWithinBase(dir, ALLOWED_REPORTS_BASE)) {
        return res.status(403).json({ error: 'Output directory not allowed' });
      }

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Generate filename and save
      const filename = generateReportFilename(session, format);
      const outputPath = path.join(dir, filename);

      // Double-check final path is still within allowed directory
      if (!isPathWithinBase(outputPath, ALLOWED_REPORTS_BASE)) {
        return res.status(403).json({ error: 'Output path not allowed' });
      }

      if (format === 'html') {
        await saveHTMLReport(reportData, outputPath, options as ReportOptions);
      } else {
        await saveTextReport(reportData, outputPath, options as ReportOptions);
      }

      // Update session with report path
      updateTestSession(sessionId, { report_path: outputPath });

      res.json({
        success: true,
        path: outputPath,
        filename,
      });
    } catch (error: any) {
      log.error('Error saving report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/reports/download/:sessionId/:format
   * Download report as file
   */
  router.get('/reports/download/:sessionId/:format', async (req: Request, res: Response) => {
    try {
      const { sessionId, format } = req.params;

      if (!['html', 'txt'].includes(format)) {
        return res.status(400).json({ error: 'format must be "html" or "txt"' });
      }

      // Load session
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Load related data
      const site = session.site_id ? getSiteById(session.site_id) : undefined;
      const droneProfiles = new Map(
        getDroneProfiles().map(p => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map(p => [p.id, p])
      );

      // Build report data
      const reportData: ReportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles,
      };

      // Generate filename
      const filename = generateReportFilename(session, format);

      // Generate content
      let content: string;
      let contentType: string;

      if (format === 'html') {
        content = generateHTMLReport(reportData);
        contentType = 'text/html';
      } else {
        content = generateTextReport(reportData);
        contentType = 'text/plain';
      }

      // Set headers for download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error: any) {
      log.error('Error downloading report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
