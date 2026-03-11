import logger from "./logger";
import crypto from "crypto";
import CryptoJS from "crypto-js";

const config = require("../../config/Config").get(process.env.NODE_ENV);
const { JWT_SECRET } = config;

// Use a stable key from env — NOT crypto.randomBytes which changes every restart
const STABLE_KEY_B64 = process.env.PHI_ENCRYPTION_KEY || "";
const encryptionKey = STABLE_KEY_B64
  ? Buffer.from(STABLE_KEY_B64, "base64")
  : crypto.randomBytes(32); // fallback for legacy — will break on restart

/**
 * AES-256-GCM encryption (replaces old CBC implementation).
 * Returns { iv, encryptedData, authTag } all as hex strings.
 */
export const encrypt = (text) => {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { iv: iv.toString("hex"), encryptedData: encrypted, authTag };
};

/**
 * AES-256-GCM decryption.
 * Supports both new GCM format (with authTag) and legacy CBC format (without authTag).
 */
export const decrypt = ({ iv, encryptedData, authTag }) => {
  // Legacy CBC fallback — old data encrypted before GCM migration
  if (!authTag) {
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      encryptionKey,
      Buffer.from(iv, "hex")
    );
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

export const encryptData = async (data) => {
  try {
    const encrypted = CryptoJS.AES.encrypt(data, JWT_SECRET).toString();
    return encrypted;
  } catch (error) {
    logger.error({ err: error }, "Encryption error");
    throw error;
  }
};

export const decryptData = async (data) => {
  try {
    const bytes = CryptoJS.AES.decrypt(data, JWT_SECRET);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  } catch (error) {
    logger.error({ err: error }, "Decryption error");
    throw error;
  }
};
