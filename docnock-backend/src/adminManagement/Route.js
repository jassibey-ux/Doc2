import {
  getIntegrationHealth,
  getSystemStatus,
  getActiveSessions,
  revokeSession,
  getAuditLogs,
  getAuditLogActions,
  getFailedLogins,
  getSystemConfig,
  updateSystemConfig,
  resetSystemConfig,
  seedSystemConfig,
} from "./Controller";
import rateLimit from "express-rate-limit";

// Rate limiter for admin endpoints — 100 requests per 15 min window
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

// Stricter rate limiter for write operations — 30 requests per 15 min
const adminWriteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many write requests, please try again later." },
});

// Validate config key format: alphanumeric with dots/underscores/hyphens, no path traversal
const validateConfigKey = (req, res, next) => {
  const key = req.params.key;
  if (!key || !/^[a-zA-Z0-9._-]+$/.test(key) || key.includes("..")) {
    return res.status(400).json({
      success: false,
      message: "Invalid config key format. Only alphanumeric characters, dots, underscores, and hyphens are allowed.",
    });
  }
  next();
};

export default (router) => {
  // Integration health monitor
  router.get("/admin/integrations/health", adminRateLimiter, getIntegrationHealth);

  // System status
  router.get("/admin/system/status", adminRateLimiter, getSystemStatus);

  // Session management
  router.get("/admin/sessions/active", adminRateLimiter, getActiveSessions);
  router.post("/admin/sessions/revoke", adminWriteRateLimiter, revokeSession);

  // Audit logs
  router.get("/admin/audit-logs", adminRateLimiter, getAuditLogs);
  router.get("/admin/audit-logs/actions", adminRateLimiter, getAuditLogActions);

  // Security
  router.get("/admin/security/failed-logins", adminRateLimiter, getFailedLogins);

  // System configuration — validate key format to prevent path traversal
  router.get("/admin/system-config", adminRateLimiter, getSystemConfig);
  router.put("/admin/system-config/:key", adminWriteRateLimiter, validateConfigKey, updateSystemConfig);
  router.post("/admin/system-config/seed", adminWriteRateLimiter, seedSystemConfig);
  router.post("/admin/system-config/:key/reset", adminWriteRateLimiter, validateConfigKey, resetSystemConfig);

  return router;
};
