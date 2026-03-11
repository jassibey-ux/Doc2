// All secrets are loaded from environment variables.
// For local dev, create a .env.local file (never committed).
// For staging/production, set env vars in the deployment platform.

const config = {
  local: {
    DB: {
      HOST: process.env.DB_HOST || "localhost",
      PORT: process.env.DB_PORT || "27017",
      DATABASE: process.env.DB_NAME || "docnock",
      USERNAME: process.env.DB_USERNAME || "",
      PASSWORD: process.env.DB_PASSWORD || "",
    },
    emailconfig: {
      username: process.env.EMAIL_USERNAME || "",
      password: process.env.EMAIL_PASSWORD || "",
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "587", 10),
      fromemail: process.env.EMAIL_FROM || "",
    },
    PORT: parseInt(process.env.PORT || "8055", 10),
    SOCKETPORT: parseInt(process.env.SOCKETPORT || "8056", 10),
    BASE_PATH: process.env.BASE_PATH || "http://localhost:8055/",
    frontend_url: process.env.FRONTEND_URL || "http://localhost:4200/",
    JWT_SECRET: process.env.JWT_SECRET || "CHANGE_ME_IN_ENV",
    JWT_EXPIRY: process.env.JWT_EXPIRY || "24h",
    REFRESH_EXPIRY: process.env.REFRESH_EXPIRY || "7d",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "CHANGE_REFRESH_ME_IN_ENV",
    branchkey: process.env.BRANCH_KEY || "",
    redis_data: {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },
    APP_ID: process.env.AGORA_APP_ID || "",
    appCertificates: process.env.AGORA_APP_CERTIFICATE || "",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "*",
    PHI_ENCRYPTION_KEY: process.env.PHI_ENCRYPTION_KEY || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  },
  development: {},
  staging: {
    DB: {
      HOST: process.env.DB_HOST || "127.0.0.1",
      PORT: process.env.DB_PORT || "27017",
      DATABASE: process.env.DB_NAME || "docnock",
      USERNAME: process.env.DB_USERNAME || "",
      PASSWORD: process.env.DB_PASSWORD || "",
    },
    emailconfig: {
      username: process.env.EMAIL_USERNAME || "",
      password: process.env.EMAIL_PASSWORD || "",
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "587", 10),
      fromemail: process.env.EMAIL_FROM || "",
    },
    PORT: parseInt(process.env.PORT || "8055", 10),
    SOCKETPORT: parseInt(process.env.SOCKETPORT || "8056", 10),
    BASE_PATH: process.env.BASE_PATH || "https://api.doc-nock.com/",
    frontend_url: process.env.FRONTEND_URL || "https://admin.doc-nock.com/",
    JWT_SECRET: process.env.JWT_SECRET || "CHANGE_ME_IN_ENV",
    JWT_EXPIRY: process.env.JWT_EXPIRY || "15m",
    REFRESH_EXPIRY: process.env.REFRESH_EXPIRY || "7d",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "CHANGE_REFRESH_ME_IN_ENV",
    branchkey: process.env.BRANCH_KEY || "",
    redis_data: {
      host: process.env.REDIS_HOST || "redis",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },
    APP_ID: process.env.AGORA_APP_ID || "",
    appCertificates: process.env.AGORA_APP_CERTIFICATE || "",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "https://admin.doc-nock.com,https://app.doc-nock.com",
    PHI_ENCRYPTION_KEY: process.env.PHI_ENCRYPTION_KEY || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  },
  production: {},
};
export const get = (env) => {
  return config[env] || config.staging;
};
