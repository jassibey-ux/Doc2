import logger from "../utils/logger";
import crypto from "crypto";
import axios from "axios";
import FaxRecord from "../models/FaxRecord";
import User from "../models/user";
import Notification from "../models/notification";
import { Success, Error } from "../utils/customeResponse";

const config = require("../../config/Config").get(process.env.NODE_ENV);

// Phaxio API config — store these in env vars
const PHAXIO_API_KEY = process.env.PHAXIO_API_KEY || "";
const PHAXIO_API_SECRET = process.env.PHAXIO_API_SECRET || "";
const PHAXIO_CALLBACK_TOKEN = process.env.PHAXIO_CALLBACK_TOKEN || "";
const PHAXIO_BASE_URL = "https://api.phaxio.com/v2.1";

// ─── Webhook: Inbound Fax from Phaxio ──────────────────────────────────────

export const inboundFaxWebhook = async (req, res) => {
  try {
    // Verify Phaxio webhook signature
    const signature = req.headers["x-phaxio-signature"];
    if (PHAXIO_CALLBACK_TOKEN && signature) {
      const expectedSignature = crypto
        .createHmac("sha1", PHAXIO_CALLBACK_TOKEN)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (signature !== expectedSignature) {
        logger.warn("Invalid Phaxio webhook signature");
        return res.status(200).send("OK"); // Return 200 to prevent retries
      }
    }

    const faxData = req.body;
    const phaxioId = faxData.fax?.id || faxData.id;
    const fromNumber = faxData.fax?.from_number || faxData.from_number || "";
    const toNumber = faxData.fax?.to_number || faxData.to_number || "";
    const numPages = faxData.fax?.num_pages || faxData.num_pages || 0;

    // Find facility by assigned fax number
    const facility = await User.findOne({
      faxNumber: toNumber,
      role: "facility_center",
    });

    // Download PDF from Phaxio (temp URL) and upload to DO Spaces
    let pdfPath = "";
    const pdfUrl = faxData.fax?.pdf_url || faxData.pdf_url;
    if (pdfUrl) {
      // Download PDF
      const pdfResponse = await axios.get(pdfUrl, {
        responseType: "arraybuffer",
        auth: { username: PHAXIO_API_KEY, password: PHAXIO_API_SECRET },
      });

      // Upload to DO Spaces (reusing existing S3 upload infrastructure)
      const AWS = require("aws-sdk");
      const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com");
      const s3 = new AWS.S3({
        endpoint: spacesEndpoint,
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.SECRET_KEY,
      });

      const key = `faxes/${phaxioId}_${Date.now()}.pdf`;
      await s3
        .putObject({
          Bucket: process.env.DO_SPACES_BUCKET || "docnock",
          Key: key,
          Body: Buffer.from(pdfResponse.data),
          ContentType: "application/pdf",
          ACL: "private",
        })
        .promise();

      pdfPath = key;
    }

    // Create FaxRecord
    const faxRecord = await FaxRecord.create({
      direction: "inbound",
      faxNumber: fromNumber,
      facilityId: facility?._id,
      pdfPath,
      pageCount: numPages,
      status: "received",
      phaxioId: String(phaxioId),
      sentAt: new Date(),
    });

    // Notify facility admins via Socket.IO (if io is available via global)
    if (facility?._id && global.io) {
      const notification = await Notification.create({
        message: `New fax received from ${fromNumber} (${numPages} pages)`,
        receiverid: facility._id,
        is_read: false,
        createdid: facility._id,
      });
    }

    return res.status(200).send("OK");
  } catch (err) {
    logger.error({ err }, "Inbound fax webhook error");
    return res.status(200).send("OK"); // Always 200 to prevent Phaxio retries
  }
};

// ─── List Fax Inbox ──────────────────────────────────────────────────────────

export const getFaxInbox = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?._id;
    const facilityId = req.query.facilityId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { direction: "inbound" };
    if (facilityId) filter.facilityId = facilityId;
    if (userId) filter.toUserId = userId;

    const [faxes, total] = await Promise.all([
      FaxRecord.find(filter)
        .populate("facilityId", "fullName")
        .populate("toUserId", "fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      FaxRecord.countDocuments(filter),
    ]);

    const unreadCount = await FaxRecord.countDocuments({
      ...filter,
      status: "received",
    });

    return Success(res, 200, "Fax inbox fetched", {
      data: faxes,
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return Error(res, 500, "Failed to fetch fax inbox", err.message);
  }
};

// ─── Mark Fax as Read ────────────────────────────────────────────────────────

export const markFaxRead = async (req, res) => {
  try {
    const { id } = req.params;
    const fax = await FaxRecord.findByIdAndUpdate(
      id,
      { status: "read", readAt: new Date() },
      { new: true }
    );
    if (!fax) return Error(res, 404, "Fax not found");
    return Success(res, 200, "Fax marked as read", fax);
  } catch (err) {
    return Error(res, 500, "Failed to mark fax as read", err.message);
  }
};

// ─── Send Outbound Fax ───────────────────────────────────────────────────────

export const sendFax = async (req, res) => {
  try {
    const { faxNumber, facilityId } = req.body;
    const file = req.file; // multer file upload

    if (!faxNumber || !file) {
      return Error(res, 400, "faxNumber and PDF file are required");
    }

    // Upload to DO Spaces first
    const AWS = require("aws-sdk");
    const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACES_ENDPOINT || "nyc3.digitaloceanspaces.com");
    const s3 = new AWS.S3({
      endpoint: spacesEndpoint,
      accessKeyId: process.env.ACCESS_KEY,
      secretAccessKey: process.env.SECRET_KEY,
    });

    const key = `faxes/outbound_${Date.now()}.pdf`;
    await s3
      .putObject({
        Bucket: process.env.DO_SPACES_BUCKET || "docnock",
        Key: key,
        Body: file.buffer,
        ContentType: "application/pdf",
        ACL: "private",
      })
      .promise();

    // Send via Phaxio
    const FormData = require("form-data");
    const formData = new FormData();
    formData.append("to", faxNumber);
    formData.append("file", file.buffer, { filename: file.originalname || "fax.pdf" });

    const phaxioRes = await axios.post(`${PHAXIO_BASE_URL}/faxes`, formData, {
      headers: formData.getHeaders(),
      auth: { username: PHAXIO_API_KEY, password: PHAXIO_API_SECRET },
    });

    const phaxioId = phaxioRes.data?.data?.id;

    const faxRecord = await FaxRecord.create({
      direction: "outbound",
      faxNumber,
      facilityId,
      pdfPath: key,
      status: "sent",
      phaxioId: String(phaxioId || ""),
      sentAt: new Date(),
      createdBy: req.user?._id,
    });

    return Success(res, 201, "Fax sent successfully", faxRecord);
  } catch (err) {
    // If Phaxio fails, record as failed
    if (err.response?.status) {
      await FaxRecord.create({
        direction: "outbound",
        faxNumber: req.body?.faxNumber || "",
        facilityId: req.body?.facilityId,
        status: "failed",
        sentAt: new Date(),
      });
    }
    return Error(res, 500, "Failed to send fax", err.message);
  }
};

// ─── Forward Fax to Chat ─────────────────────────────────────────────────────

export const forwardFaxToChat = async (req, res) => {
  try {
    const { faxId, conversationId } = req.body;
    if (!faxId || !conversationId) {
      return Error(res, 400, "faxId and conversationId are required");
    }

    const fax = await FaxRecord.findByIdAndUpdate(
      faxId,
      { status: "forwarded", conversationId },
      { new: true }
    );
    if (!fax) return Error(res, 404, "Fax not found");

    return Success(res, 200, "Fax forwarded to conversation", fax);
  } catch (err) {
    return Error(res, 500, "Failed to forward fax", err.message);
  }
};

// ─── Get/Assign Fax Number for Facility ──────────────────────────────────────

export const getFaxNumber = async (req, res) => {
  try {
    const { facilityId } = req.query;
    if (!facilityId) return Error(res, 400, "facilityId is required");

    const facility = await User.findById(facilityId);
    if (!facility) return Error(res, 404, "Facility not found");

    return Success(res, 200, "Fax number fetched", {
      faxNumber: facility.faxNumber || null,
    });
  } catch (err) {
    return Error(res, 500, "Failed to fetch fax number", err.message);
  }
};
