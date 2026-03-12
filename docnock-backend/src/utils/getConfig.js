import SystemConfig from "../models/SystemConfig";
import logger from "./logger";

const configCache = new Map(); // key -> { value, expiresAt }
const CACHE_TTL = 60_000; // 1 minute

/**
 * Get a config value with fallback.
 * Resolution: in-memory cache → MongoDB SystemConfig → fallback default
 */
export async function getConfig(key, fallback) {
  try {
    const cached = configCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const doc = await SystemConfig.findOne({ key }).lean();
    const value = doc ? doc.value : fallback;
    configCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
    return value;
  } catch (err) {
    logger.error({ err, key }, "getConfig failed, using fallback");
    return fallback;
  }
}

/**
 * Invalidate cache for a specific key or all keys.
 */
export function invalidateConfigCache(key) {
  if (key) {
    configCache.delete(key);
  } else {
    configCache.clear();
  }
}

/**
 * Pre-load all config values into cache at startup.
 * Call after MongoDB connects.
 */
export async function initConfigCache() {
  try {
    const docs = await SystemConfig.find({}).lean();
    for (const doc of docs) {
      configCache.set(doc.key, { value: doc.value, expiresAt: Date.now() + CACHE_TTL });
    }
    logger.info(`Config cache initialized with ${docs.length} entries`);
  } catch (err) {
    logger.error({ err }, "Failed to initialize config cache");
  }
}
