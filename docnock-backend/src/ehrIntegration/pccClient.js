import axios from "axios";
import { Redis } from "ioredis";
import logger from "../utils/logger";

const PCC_BASE_URL = process.env.PCC_BASE_URL || "https://connect.pointclickcare.com/api/public/preview1";
const PCC_AUTH_URL = process.env.PCC_AUTH_URL || "https://connect.pointclickcare.com/auth/token";
const PCC_CLIENT_ID = process.env.PCC_CLIENT_ID || "";
const PCC_CLIENT_SECRET = process.env.PCC_CLIENT_SECRET || "";

// Redis for token caching
const redisUrl = process.env.REDIS_URL;
const redis = new Redis(redisUrl || {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
});

const TOKEN_CACHE_KEY = "pcc:access_token";
const TOKEN_TTL = 3300; // 55 minutes (tokens expire at 60)

/**
 * Get a valid PCC OAuth2 access token (cached in Redis).
 */
async function getAccessToken() {
  const cached = await redis.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const response = await axios.post(
    PCC_AUTH_URL,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: PCC_CLIENT_ID,
      client_secret: PCC_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const token = response.data.access_token;
  await redis.setex(TOKEN_CACHE_KEY, TOKEN_TTL, token);
  logger.info("PCC OAuth token refreshed and cached");
  return token;
}

/**
 * Authenticated PCC API request.
 */
async function pccRequest(method, path, params = {}) {
  const token = await getAccessToken();
  const config = {
    method,
    url: `${PCC_BASE_URL}${path}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  };

  if (method === "GET") config.params = params;
  else config.data = params;

  return axios(config);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function searchPatients(facilityId, query) {
  const res = await pccRequest("GET", `/orgs/${facilityId}/patients`, {
    searchString: query,
    pageSize: 20,
  });
  return res.data;
}

export async function getPatientSummary(facilityId, patientId) {
  // Fetch patient demographics, medications, vitals in parallel
  const [patientRes, medsRes, vitalsRes] = await Promise.allSettled([
    pccRequest("GET", `/orgs/${facilityId}/patients/${patientId}`),
    pccRequest("GET", `/orgs/${facilityId}/patients/${patientId}/medications`, {
      status: "active",
      pageSize: 10,
    }),
    pccRequest("GET", `/orgs/${facilityId}/patients/${patientId}/vitals`, {
      pageSize: 5,
      sort: "-recordedDate",
    }),
  ]);

  const patient = patientRes.status === "fulfilled" ? patientRes.value.data : null;
  const medications = medsRes.status === "fulfilled" ? medsRes.value.data?.data ?? [] : [];
  const vitals = vitalsRes.status === "fulfilled" ? vitalsRes.value.data?.data ?? [] : [];

  return {
    patient,
    medications: medications.slice(0, 5),
    vitals: vitals.slice(0, 3),
  };
}

export async function getPatientSummaryCached(facilityId, patientId) {
  const cacheKey = `pcc:summary:${facilityId}:${patientId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.debug({ facilityId, patientId }, "PCC summary served from cache");
    return JSON.parse(cached);
  }

  const summary = await getPatientSummary(facilityId, patientId);
  await redis.setex(cacheKey, 300, JSON.stringify(summary)); // 5 min cache
  logger.debug({ facilityId, patientId }, "PCC summary fetched from API and cached");
  return summary;
}

export async function listFacilities() {
  const res = await pccRequest("GET", "/orgs");
  return res.data;
}
