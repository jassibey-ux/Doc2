import logger from "../utils/logger";
import mongoose from "mongoose";
import Message from "../models/message";
import Conversation from "../models/Conversation";
import User from "../models/user";
import { summarizeConversation } from "./summarization";

// In-memory cache for summaries (15-minute TTL)
const summaryCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

const cleanCache = () => {
  const now = Date.now();
  for (const [key, entry] of summaryCache) {
    if (now - entry.timestamp > CACHE_TTL) summaryCache.delete(key);
  }
};

/**
 * POST /ai/summarize-conversation
 * Body: { conversationId, lastN: 50 }
 */
export const summarizeConv = async (req, res) => {
  try {
    const { conversationId, lastN = 50 } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "conversationId is required" });
    }

    // Check cache
    cleanCache();
    const cacheKey = `${conversationId}_${lastN}`;
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({ success: true, summary: cached.summary, cached: true });
    }

    // Verify user has access to this conversation
    const userId = req.user?._id || req.user?.id;
    const conversation = await Conversation.findOne({
      _id: conversationId,
      "userlist.userid": userId,
    });

    if (!conversation) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Fetch last N messages
    const messages = await Message.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      isDeleted: { $ne: true },
      video: false,
    })
      .sort({ createdAt: -1 })
      .limit(lastN)
      .lean();

    if (!messages.length) {
      return res.status(200).json({
        success: true,
        summary: "No messages found in this conversation.",
      });
    }

    // Reverse to chronological order
    messages.reverse();

    // Build participant map for de-identification
    const senderIds = [...new Set(messages.map((m) => m.senderID?.toString()).filter(Boolean))];
    const users = await User.find(
      { _id: { $in: senderIds } },
      { _id: 1, role: 1 }
    ).lean();

    const participantMap = {};
    users.forEach((u) => {
      participantMap[u._id.toString()] = { role: u.role || "staff" };
    });

    const summary = await summarizeConversation(messages, participantMap);

    // Cache the result
    summaryCache.set(cacheKey, { summary, timestamp: Date.now() });

    return res.status(200).json({ success: true, summary, cached: false });
  } catch (error) {
    logger.error({ err: error }, "AI Summarization Error");
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate summary",
    });
  }
};
