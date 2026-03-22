import logger from "../utils/logger";
import AuditLog from "../models/auditLog";

/**
 * Map route paths to audit actions.
 * Only PHI-relevant routes are audited.
 */
const ROUTE_AUDIT_MAP = {
  // Auth
  "POST /login": { action: "AUTH_LOGIN", resourceType: "User" },
  "GET /logoutUser": { action: "AUTH_LOGOUT", resourceType: "User" },

  // User management
  "POST /addUser": { action: "USER_CREATED", resourceType: "User" },
  "POST /updateUser": { action: "PHI_UPDATE", resourceType: "User" },
  "POST /changeStatusAndDelete": { action: "USER_DELETED", resourceType: "User" },
  "POST /createPermission": { action: "PERMISSION_CHANGED", resourceType: "Permission" },

  // Messages / PHI
  "GET /export": { action: "PHI_EXPORT", resourceType: "Conversation" },

  // Fax
  "POST /fax/send": { action: "FAX_SENT", resourceType: "Fax" },
  "POST /fax/inbound": { action: "FAX_RECEIVED", resourceType: "Fax" },

  // PCC / EHR
  "POST /pcc/link-patient": { action: "PHI_CREATE", resourceType: "PatientLink" },

  // Forms
  "POST /forms/send": { action: "DOCUMENT_UPLOADED", resourceType: "Form" },

  // AI
  "POST /ai/summarize-conversation": { action: "PHI_ACCESS", resourceType: "Conversation" },

  // Facility Management
  "POST /admin/facilities": { action: "FACILITY_CREATED", resourceType: "Facility" },
  "PUT /admin/facilities": { action: "FACILITY_UPDATED", resourceType: "Facility" },
  "DELETE /admin/facilities": { action: "FACILITY_DELETED", resourceType: "Facility" },
};

/**
 * Create an audit log entry.
 * This function is also exported for direct use in socket handlers and controllers.
 */
export async function createAuditEntry({
  userId,
  userRole,
  action,
  resourceType,
  resourceId,
  details,
  ip,
  userAgent,
  success = true,
  failureReason,
}) {
  try {
    // Never include PHI in audit details
    const sanitizedDetails = details ? { ...details } : {};
    delete sanitizedDetails.message;
    delete sanitizedDetails.content;
    delete sanitizedDetails.body;

    await AuditLog.create({
      userId,
      userRole,
      action,
      resourceType,
      resourceId,
      details: sanitizedDetails,
      ip,
      userAgent,
      success,
      failureReason,
    });
  } catch (err) {
    // Audit logging failure should never crash the application
    logger.error({ err }, "Audit log creation failed");
  }
}

/**
 * Express middleware that automatically creates audit entries for matching routes.
 * Runs after the response is sent (post-response hook).
 */
export function auditMiddleware(req, res, next) {
  // Capture response finish to log after completion
  res.on("finish", () => {
    const routeKey = `${req.method} ${req.path}`;
    const auditConfig = ROUTE_AUDIT_MAP[routeKey];

    // Also check partial matches for dynamic routes
    let matchedConfig = auditConfig;
    if (!matchedConfig) {
      for (const [pattern, config] of Object.entries(ROUTE_AUDIT_MAP)) {
        const [method, path] = pattern.split(" ");
        if (req.method === method && req.path.startsWith(path)) {
          matchedConfig = config;
          break;
        }
      }
    }

    if (!matchedConfig) return;

    const success = res.statusCode >= 200 && res.statusCode < 400;

    createAuditEntry({
      userId: req.user?.userId,
      userRole: req.user?.role,
      action: matchedConfig.action,
      resourceType: matchedConfig.resourceType,
      resourceId: req.params?.id || req.body?.conversationId || req.body?.userId,
      details: {
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
      },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success,
      failureReason: success ? undefined : `HTTP ${res.statusCode}`,
    });
  });

  next();
}
