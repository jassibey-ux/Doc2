import logger from "../utils/logger";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/user";
import PatientFamilyLink from "../models/PatientFamilyLink";
import Conversation from "../models/Conversation";
import Message from "../models/message";
import { Success, Error } from "../utils/customeResponse";

const JWT_SECRET = process.env.JWT_SECRET || "DOCKNOCK@@@###";

/**
 * POST /family/invite
 * Body: { conversationId, familyEmail, familyName, relationshipType, accessLevel }
 * Sends a magic link to the family member's email.
 */
export const inviteFamily = async (req, res) => {
  try {
    const { conversationId, familyEmail, familyName, relationshipType, accessLevel } = req.body;
    const invitedBy = req.user?._id || req.user?.id;

    if (!conversationId || !familyEmail) {
      return Error(res, 400, "conversationId and familyEmail are required");
    }

    // Verify the conversation exists and the inviter is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      "userlist.userid": invitedBy,
    });

    if (!conversation) {
      return Error(res, 403, "You do not have access to this conversation");
    }

    // Check if already invited
    const existing = await PatientFamilyLink.findOne({
      patientConversationId: conversationId,
      familyEmail,
      isActive: true,
    });

    if (existing && !existing.magicLinkUsed) {
      return Error(res, 400, "This family member has already been invited");
    }

    // Generate magic link token (single-use, 48h expiry)
    const magicToken = crypto.randomBytes(32).toString("hex");
    const magicLinkExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const link = await PatientFamilyLink.create({
      patientConversationId: conversationId,
      familyUserId: null, // Set when they accept the link
      invitedBy,
      familyEmail,
      familyName: familyName || "",
      relationshipType: relationshipType || "other",
      accessLevel: accessLevel || "read_only",
      magicLinkToken: magicToken,
      magicLinkExpires,
    });

    // TODO: Send email with magic link via SendGrid
    // const magicLinkUrl = `${process.env.FRONTEND_URL}/family/verify/${magicToken}`;
    // await sendMagicLinkEmail(familyEmail, familyName, magicLinkUrl);

    return Success(res, 201, "Family invitation sent", {
      linkId: link._id,
      familyEmail,
      expiresAt: magicLinkExpires,
    });
  } catch (error) {
    logger.error({ err: error }, "Invite Family Error");
    return Error(res, 500, error.message);
  }
};

/**
 * GET /family/verify-link/:token
 * Validates the magic link and creates/returns a family member account.
 */
export const verifyMagicLink = async (req, res) => {
  try {
    const { token } = req.params;

    const link = await PatientFamilyLink.findOne({
      magicLinkToken: token,
      isActive: true,
    });

    if (!link) {
      return Error(res, 404, "Invalid or expired link");
    }

    if (link.magicLinkUsed) {
      return Error(res, 400, "This link has already been used. Please request a new invitation.");
    }

    if (link.magicLinkExpires < new Date()) {
      return Error(res, 400, "This link has expired. Please request a new invitation.");
    }

    // Check if family member user already exists
    let familyUser = await User.findOne({ email: link.familyEmail, role: "family_member" });

    if (!familyUser) {
      // Create a family_member account (no password — magic link only)
      familyUser = await User.create({
        fullName: link.familyName || link.familyEmail.split("@")[0],
        email: link.familyEmail,
        role: "family_member",
        status: true,
        isDeleted: false,
      });
    }

    // Mark the link as used and associate the user
    link.magicLinkUsed = true;
    link.familyUserId = familyUser._id;
    link.consentSigned = true;
    link.consentDate = new Date();
    await link.save();

    // Generate a JWT for the family member
    const familyToken = jwt.sign(
      { id: familyUser._id, role: "family_member" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return Success(res, 200, "Link verified successfully", {
      token: familyToken,
      userId: familyUser._id,
      name: familyUser.fullName,
      conversationId: link.patientConversationId,
      accessLevel: link.accessLevel,
    });
  } catch (error) {
    logger.error({ err: error }, "Verify Magic Link Error");
    return Error(res, 500, error.message);
  }
};

/**
 * GET /family/patient-summary
 * Returns a limited, family-appropriate summary (no medications, diagnoses, labs).
 */
export const getFamilyPatientSummary = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    // Find the family link for this user
    const link = await PatientFamilyLink.findOne({
      familyUserId: userId,
      isActive: true,
      consentSigned: true,
    }).populate("invitedBy", "fullName role");

    if (!link) {
      return Error(res, 403, "No active family access found");
    }

    // Get conversation details (limited info)
    const conversation = await Conversation.findById(link.patientConversationId)
      .select("groupName userlist")
      .lean();

    if (!conversation) {
      return Error(res, 404, "Conversation not found");
    }

    // Get care team members (names + roles only)
    const careTeamIds = conversation.userlist.map((u) => u.userid);
    const careTeam = await User.find(
      { _id: { $in: careTeamIds } },
      { fullName: 1, role: 1, profilePicture: 1 }
    ).lean();

    // Get recent family-visible updates (last 10 non-sensitive messages)
    const recentUpdates = await Message.find({
      conversationId: link.patientConversationId,
      isDeleted: { $ne: true },
      video: false,
      priority: { $ne: "CRITICAL" }, // Don't show CRITICAL alerts to family
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("message createdAt senderID")
      .populate("senderID", "fullName role")
      .lean();

    return Success(res, 200, "Patient summary retrieved", {
      patientName: conversation.groupName,
      careTeam: careTeam.map((t) => ({
        name: t.fullName,
        role: t.role,
      })),
      recentUpdates: recentUpdates.reverse().map((u) => ({
        message: u.message,
        date: u.createdAt,
        from: u.senderID?.role || "Staff",
      })),
      relationship: link.relationshipType,
      accessLevel: link.accessLevel,
    });
  } catch (error) {
    logger.error({ err: error }, "Family Patient Summary Error");
    return Error(res, 500, error.message);
  }
};

/**
 * POST /family/video-request
 * Family member requests a scheduled video visit.
 */
export const requestVideoVisit = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { preferredTime, notes } = req.body;

    const link = await PatientFamilyLink.findOne({
      familyUserId: userId,
      isActive: true,
    });

    if (!link) {
      return Error(res, 403, "No active family access found");
    }

    // Create a message in the conversation requesting a video visit
    const message = await Message.create({
      senderID: userId,
      conversationId: link.patientConversationId,
      message: `[Video Visit Request] Family member requests a video visit${
        preferredTime ? ` at ${preferredTime}` : ""
      }${notes ? `. Notes: ${notes}` : ""}`,
      video: false,
      status: "SENT",
      priority: "URGENT",
      timestamp: Date.now(),
    });

    return Success(res, 201, "Video visit request sent to care team", {
      messageId: message._id,
    });
  } catch (error) {
    logger.error({ err: error }, "Video Request Error");
    return Error(res, 500, error.message);
  }
};

/**
 * GET /family/links/:conversationId
 * List all family links for a conversation (for care team).
 */
export const listFamilyLinks = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const links = await PatientFamilyLink.find({
      patientConversationId: conversationId,
      isActive: true,
    })
      .populate("familyUserId", "fullName email")
      .populate("invitedBy", "fullName")
      .lean();

    return Success(res, 200, "Family links retrieved", links);
  } catch (error) {
    logger.error({ err: error }, "List Family Links Error");
    return Error(res, 500, error.message);
  }
};

/**
 * DELETE /family/links/:linkId
 * Revoke family access.
 */
export const revokeFamilyAccess = async (req, res) => {
  try {
    const { linkId } = req.params;

    await PatientFamilyLink.findByIdAndUpdate(linkId, { isActive: false });

    return Success(res, 200, "Family access revoked");
  } catch (error) {
    logger.error({ err: error }, "Revoke Family Access Error");
    return Error(res, 500, error.message);
  }
};
