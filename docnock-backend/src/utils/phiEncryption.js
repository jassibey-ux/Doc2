import logger from "./logger";
import crypto from "crypto";

// Stable encryption key from env (base64-encoded 32-byte key)
let encryptionKey = null;

function getKey() {
  if (encryptionKey) return encryptionKey;
  const keyB64 = process.env.PHI_ENCRYPTION_KEY || "";
  if (!keyB64) {
    throw new Error("PHI_ENCRYPTION_KEY env var is not set. Cannot encrypt/decrypt PHI.");
  }
  encryptionKey = Buffer.from(keyB64, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("PHI_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded).");
  }
  return encryptionKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns { iv, encryptedData, authTag } all as hex strings.
 */
export function encryptPHI(plaintext) {
  if (!plaintext || typeof plaintext !== "string") return null;
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    iv: iv.toString("hex"),
    encryptedData: encrypted,
    authTag,
  };
}

/**
 * Decrypt a PHI object { iv, encryptedData, authTag } back to plaintext.
 */
export function decryptPHI({ iv, encryptedData, authTag }) {
  if (!iv || !encryptedData || !authTag) return null;
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Check if a value is an encrypted PHI object.
 */
export function isEncryptedPHI(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.iv === "string" &&
    typeof value.encryptedData === "string" &&
    typeof value.authTag === "string"
  );
}

/**
 * Safely decrypt — returns original value if not encrypted or key unavailable.
 */
export function safeDecryptPHI(value) {
  if (!isEncryptedPHI(value)) return value;
  try {
    return decryptPHI(value);
  } catch (e) {
    logger.error({ err: e }, "PHI decryption failed");
    return "[encrypted]";
  }
}
