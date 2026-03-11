import pino from "pino";

const isProduction = process.env.NODE_ENV === "staging" || process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  ...(isProduction
    ? {
        // JSON output in production for log aggregation
        formatters: {
          level(label) {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        // Pretty output for local development
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
  // Never log PHI fields
  redact: {
    paths: [
      "password",
      "otp",
      "mfaSecret",
      "mfaBackupCodes",
      "token",
      "refreshToken",
      "bearerToken",
      "req.headers.authorization",
    ],
    censor: "[REDACTED]",
  },
});

export default logger;
