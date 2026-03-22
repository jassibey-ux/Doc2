import logger from "../utils/logger";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/user";
import PatientFamilyLink from "../models/PatientFamilyLink";
import PatientLink from "../models/PatientLink";
import Conversation from "../models/Conversation";
import Message from "../models/message";
import ActivityFeedPost from "../models/ActivityFeedPost";
import { Success, Error } from "../utils/customeResponse";
import { getPatientSummaryCached } from "../ehrIntegration/pccClient";

const JWT_SECRET = process.env.JWT_SECRET || "DOCKNOCK@@@###";

/**
 * POST /family/invite
 * Body: { conversationId, familyEmail, familyName, relationshipType, accessLevel }
 * Sends a magic link to the family member's email.
 */
export const inviteFamily = async (req, res) => {
  try {
    const { conversationId, familyEmail, familyName, relationshipType, accessLevel, pocUserId } = req.body;
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
      pocUserId: pocUserId || invitedBy, // Default POC to the person who invited
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

    // Create 1:1 family chat conversation if POC is set and chat doesn't exist yet
    let familyChatConversationId = link.familyChatConversationId;
    if (!familyChatConversationId && link.pocUserId) {
      const pocUser = await User.findById(link.pocUserId).select("fullName").lean();
      const newChat = await Conversation.create({
        groupName: `Family Chat - ${familyUser.fullName}`,
        userlist: [
          { userid: familyUser._id, name: familyUser.fullName, status: "active" },
          { userid: link.pocUserId, name: pocUser?.fullName || "Care Team", status: "active" },
        ],
        isGroup: false,
      });
      link.familyChatConversationId = newChat._id;
      familyChatConversationId = newChat._id;
    }

    await link.save();

    // Generate a JWT for the family member
    const familyToken = jwt.sign(
      { userId: familyUser._id, role: "family_member" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return Success(res, 200, "Link verified successfully", {
      token: familyToken,
      userId: familyUser._id,
      name: familyUser.fullName,
      conversationId: link.patientConversationId,
      familyChatConversationId,
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

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /family/feed?page=1&limit=20
 * Returns paginated activity feed posts visible to this family member.
 */
export const getFamilyFeed = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Find the family link to determine which facility/conversations they can see
    const link = await PatientFamilyLink.findOne({
      familyUserId: userId,
      isActive: true,
      consentSigned: true,
    });

    if (!link) {
      return Error(res, 403, "No active family access found");
    }

    // Get the facility (conversation creator / admin) for facility-wide posts
    const conversation = await Conversation.findById(link.patientConversationId)
      .select("userlist")
      .lean();

    const facilityUserIds = conversation?.userlist?.map((u) => u.userid) || [];

    // Feed query: all_families posts from facility staff, OR specific posts that include this conversation
    const feedQuery = {
      isActive: true,
      $or: [
        {
          visibility: "all_families",
          authorId: { $in: facilityUserIds },
        },
        {
          visibility: "specific_patients",
          linkedPatientConversations: link.patientConversationId,
        },
      ],
    };

    const [posts, total] = await Promise.all([
      ActivityFeedPost.find(feedQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("authorId", "fullName role profilePicture")
        .lean(),
      ActivityFeedPost.countDocuments(feedQuery),
    ]);

    return Success(res, 200, "Feed retrieved", {
      posts: posts.map((p) => ({
        _id: p._id,
        type: p.type,
        title: p.title,
        body: p.body,
        images: p.images,
        authorName: p.authorId?.fullName || p.authorName,
        authorRole: p.authorId?.role,
        authorAvatar: p.authorId?.profilePicture,
        likesCount: p.likesCount || 0,
        createdAt: p.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + posts.length < total,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Get Family Feed Error");
    return Error(res, 500, error.message);
  }
};

/**
 * POST /family/feed
 * Staff creates a new activity feed post. Family members cannot create posts.
 */
export const createFeedPost = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    // Only staff can create posts
    if (userRole === "family_member") {
      return Error(res, 403, "Family members cannot create feed posts");
    }

    const { title, body, type, images, visibility, linkedPatientConversations } = req.body;

    if (!body) {
      return Error(res, 400, "Post body is required");
    }

    const author = await User.findById(userId).select("fullName").lean();

    const post = await ActivityFeedPost.create({
      facilityId: userId, // The staff member's ID as facility reference
      authorId: userId,
      authorName: author?.fullName || "Staff",
      type: type || "update",
      title,
      body,
      images: images || [],
      visibility: visibility || "all_families",
      linkedPatientConversations: linkedPatientConversations || [],
    });

    return Success(res, 201, "Feed post created", {
      _id: post._id,
      type: post.type,
      title: post.title,
      body: post.body,
      images: post.images,
      createdAt: post.createdAt,
    });
  } catch (error) {
    logger.error({ err: error }, "Create Feed Post Error");
    return Error(res, 500, error.message);
  }
};

/**
 * DELETE /family/feed/:postId
 * Staff deletes a feed post (soft delete).
 */
export const deleteFeedPost = async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (userRole === "family_member") {
      return Error(res, 403, "Family members cannot delete feed posts");
    }

    const { postId } = req.params;
    await ActivityFeedPost.findByIdAndUpdate(postId, { isActive: false });

    return Success(res, 200, "Feed post deleted");
  } catch (error) {
    logger.error({ err: error }, "Delete Feed Post Error");
    return Error(res, 500, error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FAMILY CHAT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /family/chat
 * Returns (or creates) the 1:1 chat conversation between family member and POC.
 */
export const getFamilyChat = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const link = await PatientFamilyLink.findOne({
      familyUserId: userId,
      isActive: true,
      consentSigned: true,
    });

    if (!link) {
      return Error(res, 403, "No active family access found");
    }

    // If chat conversation already exists, return it
    if (link.familyChatConversationId) {
      const conversation = await Conversation.findById(link.familyChatConversationId)
        .select("groupName userlist")
        .lean();

      return Success(res, 200, "Family chat retrieved", {
        conversationId: link.familyChatConversationId,
        groupName: conversation?.groupName,
        participants: conversation?.userlist,
      });
    }

    // Create one if POC is set
    if (!link.pocUserId) {
      return Error(res, 404, "No point of contact assigned yet. Please contact the facility.");
    }

    const familyUser = await User.findById(userId).select("fullName").lean();
    const pocUser = await User.findById(link.pocUserId).select("fullName").lean();

    const newChat = await Conversation.create({
      groupName: `Family Chat - ${familyUser?.fullName || "Family Member"}`,
      userlist: [
        { userid: userId, name: familyUser?.fullName || "Family Member", status: "active" },
        { userid: link.pocUserId, name: pocUser?.fullName || "Care Team", status: "active" },
      ],
      isGroup: false,
    });

    link.familyChatConversationId = newChat._id;
    await link.save();

    return Success(res, 200, "Family chat created", {
      conversationId: newChat._id,
      groupName: newChat.groupName,
      participants: newChat.userlist,
    });
  } catch (error) {
    logger.error({ err: error }, "Get Family Chat Error");
    return Error(res, 500, error.message);
  }
};

/**
 * GET /family/chat/messages?page=1&limit=50
 * Returns paginated messages from the family chat conversation.
 */
export const getFamilyChatMessages = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const link = await PatientFamilyLink.findOne({
      familyUserId: userId,
      isActive: true,
      consentSigned: true,
    });

    if (!link || !link.familyChatConversationId) {
      return Error(res, 404, "No family chat found");
    }

    const [messages, total] = await Promise.all([
      Message.find({
        conversationId: link.familyChatConversationId,
        isDeleted: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("senderID", "fullName role profilePicture")
        .lean(),
      Message.countDocuments({
        conversationId: link.familyChatConversationId,
        isDeleted: { $ne: true },
      }),
    ]);

    return Success(res, 200, "Messages retrieved", {
      messages: messages.reverse().map((m) => ({
        _id: m._id,
        messageId: m.messageId,
        message: m.message,
        senderId: m.senderID?._id,
        senderName: m.senderID?.fullName,
        senderRole: m.senderID?.role,
        senderAvatar: m.senderID?.profilePicture,
        attachments: m.attachments,
        timestamp: m.timestamp,
        createdAt: m.createdAt,
        status: m.status,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + messages.length < total,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Get Family Chat Messages Error");
    return Error(res, 500, error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FAMILY HEALTH (PCC)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /family/health
 * Returns PCC vitals and medications for the family member's linked patient.
 */
export const getFamilyHealth = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    // Find the family link
    const familyLink = await PatientFamilyLink.findOne({
      familyUserId: userId,
      isActive: true,
      consentSigned: true,
    });

    if (!familyLink) {
      return Error(res, 403, "No active family access found");
    }

    // Find the PCC patient link for this conversation
    const patientLink = await PatientLink.findOne({
      docnockConversationId: familyLink.patientConversationId,
    }).lean();

    if (!patientLink) {
      return Success(res, 200, "No patient record linked", {
        linked: false,
        vitals: [],
        medications: [],
      });
    }

    try {
      const summary = await getPatientSummaryCached(
        patientLink.pccFacilityId,
        patientLink.pccPatientId
      );

      return Success(res, 200, "Patient health data retrieved", {
        linked: true,
        patientName: patientLink.patientName,
        vitals: summary?.vitals || [],
        medications: summary?.medications || [],
        lastUpdated: new Date().toISOString(),
      });
    } catch (pccError) {
      logger.warn({ err: pccError }, "PCC data fetch failed for family health view");
      return Success(res, 200, "Unable to fetch latest health data", {
        linked: true,
        patientName: patientLink.patientName,
        vitals: [],
        medications: [],
        error: "Health data temporarily unavailable",
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Family Health Error");
    return Error(res, 500, error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FAMILY VIDEO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /family/video/token
 * Generates an Agora token for the family member to join a video call.
 */
export const getFamilyVideoToken = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const link = await PatientFamilyLink.findOne({
      familyUserId: userId,
      isActive: true,
    });

    if (!link) {
      return Error(res, 403, "No active family access found");
    }

    // Use the patient conversation as the Agora channel
    const groupId = link.patientConversationId.toString();
    const uid = Math.floor(Math.random() * 10000);

    try {
      const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
      const APP_ID = process.env.AGORA_APP_ID;
      const APP_CERT = process.env.AGORA_APP_CERTIFICATE;

      if (!APP_ID || !APP_CERT) {
        return Error(res, 500, "Video calling not configured");
      }

      const expirationTimeInSeconds = 3600;
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

      const token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERT,
        groupId,
        uid,
        RtcRole.PUBLISHER,
        privilegeExpiredTs
      );

      return Success(res, 200, "Video token generated", {
        token,
        uid,
        channelName: groupId,
      });
    } catch (agoraError) {
      logger.warn({ err: agoraError }, "Agora token generation failed");
      return Error(res, 500, "Video calling service unavailable");
    }
  } catch (error) {
    logger.error({ err: error }, "Family Video Token Error");
    return Error(res, 500, error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN FAMILY PORTAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /family/admin/stats
 * Returns KPI stats for the admin dashboard.
 */
export const getAdminFamilyStats = async (req, res) => {
  try {
    const [total, active, pending, revoked] = await Promise.all([
      PatientFamilyLink.countDocuments({ isActive: true }),
      PatientFamilyLink.countDocuments({ isActive: true, magicLinkUsed: true }),
      PatientFamilyLink.countDocuments({ isActive: true, magicLinkUsed: false }),
      PatientFamilyLink.countDocuments({ isActive: false }),
    ]);

    return Success(res, 200, "Family portal stats", {
      totalFamilies: total,
      activeLinks: active,
      pendingInvites: pending,
      revokedLinks: revoked,
    });
  } catch (error) {
    logger.error({ err: error }, "Admin Family Stats Error");
    return Error(res, 500, error.message);
  }
};

/**
 * GET /family/admin/links
 * Lists all PatientFamilyLinks with pagination, search, and filters.
 */
export const getAdminFamilyLinks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, status, relationship } = req.query;

    // Build filter
    const filter = {};

    if (status === "active") {
      filter.isActive = true;
      filter.magicLinkUsed = true;
    } else if (status === "pending") {
      filter.isActive = true;
      filter.magicLinkUsed = false;
    } else if (status === "revoked") {
      filter.isActive = false;
    }

    if (relationship) {
      filter.relationshipType = relationship;
    }

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { familyName: regex },
        { familyEmail: regex },
      ];
    }

    const [links, total] = await Promise.all([
      PatientFamilyLink.find(filter)
        .populate("familyUserId", "fullName email profilePicture")
        .populate("invitedBy", "fullName")
        .populate("pocUserId", "fullName")
        .populate("patientConversationId", "groupName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PatientFamilyLink.countDocuments(filter),
    ]);

    return Success(res, 200, "Family links retrieved", {
      links,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Admin Family Links Error");
    return Error(res, 500, error.message);
  }
};

/**
 * PUT /family/admin/links/:linkId
 * Updates a PatientFamilyLink (POC, access level, relationship).
 */
export const updateAdminFamilyLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { pocUserId, accessLevel, relationshipType } = req.body;

    const updates = {};
    if (pocUserId) updates.pocUserId = pocUserId;
    if (accessLevel) updates.accessLevel = accessLevel;
    if (relationshipType) updates.relationshipType = relationshipType;

    const link = await PatientFamilyLink.findByIdAndUpdate(
      linkId,
      { $set: updates },
      { new: true }
    )
      .populate("familyUserId", "fullName email")
      .populate("pocUserId", "fullName")
      .populate("patientConversationId", "groupName");

    if (!link) {
      return Error(res, 404, "Family link not found");
    }

    return Success(res, 200, "Family link updated", link);
  } catch (error) {
    logger.error({ err: error }, "Admin Update Family Link Error");
    return Error(res, 500, error.message);
  }
};

/**
 * POST /family/admin/links/:linkId/resend
 * Regenerates the magic link token and resets expiry.
 */
export const resendFamilyInvite = async (req, res) => {
  try {
    const { linkId } = req.params;

    const link = await PatientFamilyLink.findById(linkId);
    if (!link) {
      return Error(res, 404, "Family link not found");
    }

    if (link.magicLinkUsed) {
      return Error(res, 400, "This invitation has already been accepted");
    }

    // Generate new token and reset expiry
    const newToken = crypto.randomBytes(32).toString("hex");
    link.magicLinkToken = newToken;
    link.magicLinkExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    await link.save();

    // TODO: Send email with new magic link

    return Success(res, 200, "Invitation resent successfully", {
      linkId: link._id,
      familyEmail: link.familyEmail,
      expiresAt: link.magicLinkExpires,
    });
  } catch (error) {
    logger.error({ err: error }, "Admin Resend Invite Error");
    return Error(res, 500, error.message);
  }
};
