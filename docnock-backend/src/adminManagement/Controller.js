import mongoose from "mongoose";
import logger from "../utils/logger";
import { encryptData } from "../utils/encryptionUtils";
import RefreshToken from "../models/refreshToken";
import AuditLog from "../models/auditLog";
import SystemConfig from "../models/SystemConfig";
import systemConfigDefinitions from "../config/systemConfigDefinitions";
import { invalidateConfigCache } from "../utils/getConfig";

const config = require("../../config/Config").get(process.env.NODE_ENV);

// ─── Helper: check if a role is superadmin ───
function requireSuperadmin(req, res) {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Forbidden: superadmin only" });
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 1. Integration Health — GET /admin/integrations/health
// ═══════════════════════════════════════════════════════════════
export const getIntegrationHealth = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const integrations = {};

    // ── MongoDB ──
    try {
      const state = mongoose.connection.readyState;
      const stateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
      const dbStats = state === 1 ? await mongoose.connection.db.stats() : null;
      integrations.mongodb = {
        status: state === 1 ? "healthy" : "unhealthy",
        state: stateMap[state] || "unknown",
        database: mongoose.connection.name,
        collections: dbStats?.collections || 0,
        dataSize: dbStats ? `${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB` : null,
        storageSize: dbStats ? `${(dbStats.storageSize / 1024 / 1024).toFixed(2)} MB` : null,
        indexes: dbStats?.indexes || 0,
      };
    } catch (err) {
      integrations.mongodb = { status: "error", error: err.message };
    }

    // ── Redis ──
    {
      let redisClient = null;
      try {
        const ioredis = require("ioredis");
        redisClient = new ioredis({
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: Number(process.env.REDIS_PORT) || 6379,
          connectTimeout: 3000,
          lazyConnect: true,
        });
        await redisClient.connect();
        const info = await redisClient.info("memory");
        const memMatch = info.match(/used_memory_human:(\S+)/);
        const keysInfo = await redisClient.info("keyspace");
        const keyMatch = keysInfo.match(/keys=(\d+)/);
        integrations.redis = {
          status: "healthy",
          memory: memMatch ? memMatch[1] : "unknown",
          keys: keyMatch ? parseInt(keyMatch[1]) : 0,
        };
      } catch (err) {
        integrations.redis = { status: "unhealthy", error: err.message };
      } finally {
        if (redisClient) {
          try { await redisClient.quit(); } catch (_) { /* ignore cleanup errors */ }
        }
      }
    }

    // ── PointClickCare ──
    const pccClientId = process.env.PCC_CLIENT_ID || config.PCC_CLIENT_ID;
    const pccBaseUrl = process.env.PCC_BASE_URL || config.PCC_BASE_URL;
    integrations.pointClickCare = {
      status: pccClientId ? "configured" : "not_configured",
      baseUrl: pccBaseUrl || "not set",
      clientIdSet: !!pccClientId,
      clientSecretSet: !!(process.env.PCC_CLIENT_SECRET || config.PCC_CLIENT_SECRET),
    };

    // ── Agora (Video) ──
    const agoraAppId = process.env.APP_ID || config.APP_ID;
    integrations.agora = {
      status: agoraAppId ? "configured" : "not_configured",
      appIdSet: !!agoraAppId,
      appCertificateSet: !!(process.env.appCertificates || config.appCertificates),
    };

    // ── Phaxio (Fax) ──
    const phaxioKey = process.env.PHAXIO_API_KEY || config.PHAXIO_API_KEY;
    integrations.phaxio = {
      status: phaxioKey ? "configured" : "not_configured",
      apiKeySet: !!phaxioKey,
      apiSecretSet: !!(process.env.PHAXIO_API_SECRET || config.PHAXIO_API_SECRET),
      callbackTokenSet: !!(process.env.PHAXIO_CALLBACK_TOKEN || config.PHAXIO_CALLBACK_TOKEN),
    };

    // ── Firebase (Push Notifications) ──
    let firebaseStatus = "not_configured";
    try {
      const admin = require("firebase-admin");
      if (admin.apps.length > 0) firebaseStatus = "initialized";
      else firebaseStatus = "not_initialized";
    } catch {
      firebaseStatus = "not_available";
    }
    integrations.firebase = { status: firebaseStatus };

    // ── SendGrid / Email ──
    const emailConfig = config.emailconfig || {};
    integrations.email = {
      status: emailConfig.host ? "configured" : "not_configured",
      host: emailConfig.host || "not set",
      from: emailConfig.fromemail || "not set",
    };

    // ── DigitalOcean Spaces ──
    const doSpacesKey = process.env.DO_SPACES_KEY || config.DO_SPACES_KEY;
    integrations.digitalOceanSpaces = {
      status: doSpacesKey ? "configured" : "not_configured",
      endpoint: process.env.DO_SPACES_ENDPOINT || config.DO_SPACES_ENDPOINT || "not set",
      bucket: process.env.DO_SPACES_BUCKET || config.DO_SPACES_BUCKET || "not set",
    };

    // ── Claude AI ──
    const anthropicKey = process.env.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY;
    integrations.claudeAI = {
      status: anthropicKey ? "configured" : "not_configured",
      apiKeySet: !!anthropicKey,
    };

    const encryptDatauserdata = await encryptData(JSON.stringify(integrations));

    return res.status(200).json({
      success: true,
      message: "Integration health retrieved",
      encryptDatauserdata,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to get integration health");
    return res.status(500).json({ success: false, message: "Failed to retrieve integration health" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 2. System Status — GET /admin/system/status
// ═══════════════════════════════════════════════════════════════
export const getSystemStatus = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    // DB stats
    const dbState = mongoose.connection.readyState;
    let dbStats = null;
    if (dbState === 1) {
      dbStats = await mongoose.connection.db.stats();
    }

    // Collection document counts
    const collectionCounts = {};
    if (dbState === 1) {
      const collections = ["users", "conversations", "messages", "notifications",
        "oncallschedules", "escalationchains", "faxrecords", "formtemplates",
        "formsubmissions", "patientlinks", "auditlogs", "loginrecords",
        "refreshtokens", "permissions"];
      for (const coll of collections) {
        try {
          collectionCounts[coll] = await mongoose.connection.db.collection(coll).estimatedDocumentCount();
        } catch {
          collectionCounts[coll] = 0;
        }
      }
    }

    const systemStatus = {
      server: {
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        uptimeSeconds: Math.floor(uptime),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        env: process.env.NODE_ENV,
      },
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
      },
      database: {
        status: dbState === 1 ? "connected" : "disconnected",
        name: mongoose.connection.name,
        host: mongoose.connection.host,
        dataSize: dbStats ? `${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB` : null,
        collections: collectionCounts,
      },
      ports: {
        api: process.env.PORT || config.PORT,
        socket: process.env.SOCKETPORT || config.SOCKETPORT,
      },
    };

    const encryptDatauserdata = await encryptData(JSON.stringify(systemStatus));

    return res.status(200).json({
      success: true,
      message: "System status retrieved",
      encryptDatauserdata,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to get system status");
    return res.status(500).json({ success: false, message: "Failed to retrieve system status" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 3. Active Sessions — GET /admin/sessions/active
// ═══════════════════════════════════════════════════════════════
export const getActiveSessions = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const sessions = await RefreshToken.find({ expiresAt: { $gt: new Date() } })
      .populate("userId", "fullName mobile role profilePic status")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = sessions.map((s) => ({
      _id: s._id,
      user: s.userId
        ? {
            _id: s.userId._id,
            fullName: s.userId.fullName,
            mobile: s.userId.mobile,
            role: s.userId.role,
            profilePic: s.userId.profilePic,
            status: s.userId.status,
          }
        : null,
      userAgent: s.userAgent || "Unknown",
      ip: s.ip || "Unknown",
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));

    const encryptDatauserdata = await encryptData(JSON.stringify(formatted));

    return res.status(200).json({
      success: true,
      message: "Active sessions retrieved",
      encryptDatauserdata,
      totalSessions: formatted.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to get active sessions");
    return res.status(500).json({ success: false, message: "Failed to retrieve sessions" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 4. Revoke Session — POST /admin/sessions/revoke
// ═══════════════════════════════════════════════════════════════
export const revokeSession = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const { sessionId, userId, revokeAll } = req.body;

    if (revokeAll && userId) {
      // Revoke all sessions for a specific user
      const result = await RefreshToken.deleteMany({ userId });
      logger.info({ adminId: req.user.userId, targetUserId: userId }, "All sessions revoked for user");
      return res.status(200).json({ success: true, message: `Revoked ${result.deletedCount} sessions` });
    } else if (sessionId) {
      // Revoke a single session
      await RefreshToken.findByIdAndDelete(sessionId);
      logger.info({ adminId: req.user.userId, sessionId }, "Session revoked");
      return res.status(200).json({ success: true, message: "Session revoked" });
    } else {
      return res.status(400).json({ success: false, message: "sessionId or userId+revokeAll required" });
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to revoke session");
    return res.status(500).json({ success: false, message: "Failed to revoke session" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 5. Audit Logs — GET /admin/audit-logs
// ═══════════════════════════════════════════════════════════════
export const getAuditLogs = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const {
      page = 1,
      limit = 50,
      action,
      userId,
      startDate,
      endDate,
      success: successFilter,
      ip,
      resourceType,
    } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.userId = userId;
    if (ip) filter.ip = { $regex: ip, $options: "i" };
    if (resourceType) filter.resourceType = resourceType;
    if (successFilter !== undefined) filter.success = successFilter === "true";
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalRecords = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .populate("userId", "fullName mobile role")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const encryptDatauserdata = await encryptData(JSON.stringify(logs));

    return res.status(200).json({
      success: true,
      message: "Audit logs retrieved",
      encryptDatauserdata,
      totalRecords,
      page: parseInt(page),
      totalPages: Math.ceil(totalRecords / parseInt(limit)),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to get audit logs");
    return res.status(500).json({ success: false, message: "Failed to retrieve audit logs" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 6. Audit Log Action Types — GET /admin/audit-logs/actions
// ═══════════════════════════════════════════════════════════════
export const getAuditLogActions = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const actions = await AuditLog.distinct("action");
    return res.status(200).json({ success: true, data: actions });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to retrieve action types" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 7. Failed Login Attempts — GET /admin/security/failed-logins
// ═══════════════════════════════════════════════════════════════
export const getFailedLogins = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const failedLogins = await AuditLog.find({
      action: "AUTH_FAIL",
      timestamp: { $gte: since },
    })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    const encryptDatauserdata = await encryptData(JSON.stringify(failedLogins));

    return res.status(200).json({
      success: true,
      message: "Failed logins retrieved",
      encryptDatauserdata,
      total: failedLogins.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to get failed logins");
    return res.status(500).json({ success: false, message: "Failed to retrieve failed logins" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 8. Get System Config — GET /admin/system-config
// ═══════════════════════════════════════════════════════════════
export const getSystemConfig = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const configs = await SystemConfig.find({})
      .sort({ category: 1, key: 1 })
      .lean();

    // Group by category
    const grouped = {};
    for (const cfg of configs) {
      if (!grouped[cfg.category]) grouped[cfg.category] = [];
      grouped[cfg.category].push(cfg);
    }

    const encryptDatauserdata = await encryptData(JSON.stringify(grouped));

    return res.status(200).json({
      success: true,
      message: "System config retrieved",
      encryptDatauserdata,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to get system config");
    return res.status(500).json({ success: false, message: "Failed to retrieve system config" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 9. Update System Config — PUT /admin/system-config/:key
// ═══════════════════════════════════════════════════════════════
export const updateSystemConfig = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, message: "value is required" });
    }

    const existing = await SystemConfig.findOne({ key });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Config key '${key}' not found` });
    }

    // Validate based on dataType and validation rules
    const validationError = validateConfigValue(existing, value);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const oldValue = existing.value;
    existing.value = value;
    existing.lastModifiedBy = req.user.userId;
    existing.lastModifiedAt = new Date();
    await existing.save();

    // Bust cache
    invalidateConfigCache(key);

    // Audit log
    try {
      await new AuditLog({
        userId: req.user.userId,
        userRole: req.user.role,
        action: "CONFIG_CHANGED",
        resourceType: "SystemConfig",
        resourceId: existing._id,
        details: { key, oldValue, newValue: value },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        success: true,
      }).save();
    } catch (auditErr) {
      logger.error({ err: auditErr }, "Failed to create audit log for config change");
    }

    const encryptDatauserdata = await encryptData(JSON.stringify(existing.toObject()));

    return res.status(200).json({
      success: true,
      message: existing.requiresRestart
        ? "Config updated. Server restart required for this change to take effect."
        : "Config updated successfully",
      encryptDatauserdata,
      requiresRestart: existing.requiresRestart,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to update system config");
    return res.status(500).json({ success: false, message: "Failed to update config" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 10. Reset System Config — POST /admin/system-config/:key/reset
// ═══════════════════════════════════════════════════════════════
export const resetSystemConfig = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const { key } = req.params;

    const existing = await SystemConfig.findOne({ key });
    if (!existing) {
      return res.status(404).json({ success: false, message: `Config key '${key}' not found` });
    }

    const oldValue = existing.value;
    existing.value = existing.defaultValue;
    existing.lastModifiedBy = req.user.userId;
    existing.lastModifiedAt = new Date();
    await existing.save();

    invalidateConfigCache(key);

    // Audit log
    try {
      await new AuditLog({
        userId: req.user.userId,
        userRole: req.user.role,
        action: "CONFIG_CHANGED",
        resourceType: "SystemConfig",
        resourceId: existing._id,
        details: { key, oldValue, newValue: existing.defaultValue, reset: true },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        success: true,
      }).save();
    } catch (auditErr) {
      logger.error({ err: auditErr }, "Failed to create audit log for config reset");
    }

    const encryptDatauserdata = await encryptData(JSON.stringify(existing.toObject()));

    return res.status(200).json({
      success: true,
      message: "Config reset to default",
      encryptDatauserdata,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to reset system config");
    return res.status(500).json({ success: false, message: "Failed to reset config" });
  }
};

// ═══════════════════════════════════════════════════════════════
// 11. Seed System Config — POST /admin/system-config/seed
// ═══════════════════════════════════════════════════════════════
export const seedSystemConfig = async (req, res) => {
  try {
    const denied = requireSuperadmin(req, res);
    if (denied) return denied;

    const ops = systemConfigDefinitions.map((def) => ({
      updateOne: {
        filter: { key: def.key },
        update: {
          $setOnInsert: { value: def.defaultValue },
          $set: {
            defaultValue: def.defaultValue,
            category: def.category,
            dataType: def.dataType,
            label: def.label,
            description: def.description,
            unit: def.unit || "",
            validation: def.validation || {},
            requiresRestart: def.requiresRestart || false,
          },
        },
        upsert: true,
      },
    }));

    const result = await SystemConfig.bulkWrite(ops);

    return res.status(200).json({
      success: true,
      message: `Config seeded: ${result.upsertedCount} created, ${result.modifiedCount} updated`,
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to seed system config");
    return res.status(500).json({ success: false, message: "Failed to seed config" });
  }
};

// ─── Helper: validate config value ───
function validateConfigValue(configDoc, value) {
  const { dataType, validation } = configDoc;

  if (dataType === "number") {
    if (typeof value !== "number" || isNaN(value)) return "Value must be a number";
    if (validation?.min !== undefined && value < validation.min) return `Value must be at least ${validation.min}`;
    if (validation?.max !== undefined && value > validation.max) return `Value must be at most ${validation.max}`;
  } else if (dataType === "string") {
    if (typeof value !== "string") return "Value must be a string";
    if (validation?.pattern) {
      const re = new RegExp(validation.pattern);
      if (!re.test(value)) return `Value must match pattern: ${validation.pattern}`;
    }
    if (validation?.options?.length && !validation.options.includes(value)) {
      return `Value must be one of: ${validation.options.join(", ")}`;
    }
  } else if (dataType === "boolean") {
    if (typeof value !== "boolean") return "Value must be a boolean";
  } else if (dataType === "string_array") {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      return "Value must be an array of strings";
    }
  }

  return null;
}
