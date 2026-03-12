import logger from "../utils/logger";
import mongoose from "mongoose";
import crypto from "crypto";

const auditLogSchema = mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
  },
  userRole: String,
  action: {
    type: String,
    required: true,
    enum: [
      "PHI_ACCESS",
      "PHI_CREATE",
      "PHI_UPDATE",
      "PHI_DELETE",
      "PHI_EXPORT",
      "PHI_TRANSMIT",
      "AUTH_LOGIN",
      "AUTH_LOGOUT",
      "AUTH_FAIL",
      "AUTH_MFA",
      "USER_CREATED",
      "USER_DELETED",
      "PERMISSION_CHANGED",
      "CALL_STARTED",
      "CALL_ENDED",
      "DOCUMENT_ACCESSED",
      "DOCUMENT_UPLOADED",
      "FAX_SENT",
      "FAX_RECEIVED",
      "CONFIG_CHANGED",
    ],
    index: true,
  },
  resourceType: String,
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  details: Object, // sanitized — no PHI in the log itself
  ip: String,
  userAgent: String,
  success: {
    type: Boolean,
    required: true,
    default: true,
  },
  failureReason: String,
  previousHash: String,
  entryHash: String,
});

// TTL index: 6 years (HIPAA requires 6-year retention)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 6 * 365 * 24 * 60 * 60 });

// Hash chain pre-save hook for tamper evidence
auditLogSchema.pre("save", async function (next) {
  try {
    // Get the most recent audit log entry
    const lastEntry = await AuditLog.findOne().sort({ _id: -1 }).select("entryHash").lean();
    this.previousHash = lastEntry?.entryHash || "GENESIS";

    // Compute hash of this entry's content
    const content = JSON.stringify({
      timestamp: this.timestamp,
      userId: this.userId,
      action: this.action,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      success: this.success,
      previousHash: this.previousHash,
    });
    this.entryHash = crypto.createHash("sha256").update(content).digest("hex");
  } catch (err) {
    // Don't block audit logging on hash computation failure
    logger.error({ err }, "Audit log hash computation failed");
  }
  next();
});

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
