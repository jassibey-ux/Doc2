import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import routes from "./src/AllRoutes";
import { ensureAuthorized } from "./src/middleware/authMiddleware";
import "./src/middleware/userUploads";
import path from "path";
import http from 'http'
import rateLimit from 'express-rate-limit'


const config = require("./config/Config")

const env = process.env.NODE_ENV || "local";
const configValue = config.get(env);

const port = configValue?.PORT || 3000;
const SOCKETPORT = configValue?.SOCKETPORT || 3000;

// CORS origin whitelist from env
const allowedOrigins = (configValue?.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || "*")
  .split(",").map(s => s.trim()).filter(Boolean);
const corsOrigin = allowedOrigins.includes("*") ? "*" : allowedOrigins;

const io = require("socket.io")(SOCKETPORT, {
  maxHttpBufferSize: 10e6,
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const app = express();
app.use(bodyParser.json({ limit: "50MB" }));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(cors({
  origin: corsOrigin === "*" ? "*" : corsOrigin,
  credentials: corsOrigin !== "*",
}));

/* Access files directly via path */
app.use("/user-uploads/images",express.static(path.join(__dirname, process.env.PATIENT_UPLOAD_PATH)));
app.use("/user-uploads/profiles", express.static(path.join(__dirname, process.env.USER_PROFILE_PATH)));

// Trust proxy for rate limiting behind load balancer
app.set("trust proxy", 1);

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/v1/login", authLimiter);
app.use("/api/v1/verifyOTP", authLimiter);
app.use("/api/v1/refresh-token", authLimiter);

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { success: false, message: "Too many password reset attempts, try again later" },
});
app.use("/api/v1/forgotPassword", forgotPasswordLimiter);

// Health check endpoint (outside auth middleware)
app.get("/health", (req, res) => {
  const mongoose = require("mongoose");
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    env,
    uptime: process.uptime(),
  });
});

app.use("/api/v1", ensureAuthorized, routes(express));

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Server running on ${env} environment, port ${port}`);
});
app.set("io", io);
require('./Socket')(io);
export default app;
