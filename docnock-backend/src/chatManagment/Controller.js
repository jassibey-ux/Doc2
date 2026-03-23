// conversationController.js

import logger from "../utils/logger";
import mongoose from "mongoose";
import Conversation from "../models/Conversation"; // Path to your Conversation model
import User from "../models/user";
import { encrypt, encryptData } from "../utils/encryptionUtils";
import { safeDecryptPHI } from "../utils/phiEncryption";
import Message from "../models/message";
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const configdata = require("../../config/Config").get(process.env.NODE_ENV);
import Notification from "../models/notification";
// console.log(configdata,"configdata");

var APP_ID = configdata.APP_ID;
var appCertificates = configdata.appCertificates;
// Controller function to create a new conversation
export const createConversation = async (req, res) => {
  var {
    groupName,
    userlist,
    participants,
    callstatus,
    callerId,
    callerName,
    latestMessage,
    groupPicture,
    senderID,
  } = req.body;

  try {
    let senderID =
      req.body.senderID && req.body.senderID !== ""
        ? req.body.senderID
        : req.user.userId;

    if (participants == undefined) {
      participants = [];
    }
    if (callstatus == undefined) {
      callstatus = null;
    }
    if (callerName == undefined) {
      callerName = null;
    }
    if (latestMessage == undefined) {
      latestMessage = "";
    }

    var roomName = Math.floor(Math.random() * 1_000_000_000);

    groupPicture = null;
    if (req.file) {
      // console.log(req.file);

      groupPicture = {
        originalName: req.file.originalname,
        savedName: req.file.filename,
      };
      // console.log(groupPicture, "profilePicture");
    }
    const getlastcount = await Conversation.findOne({}).sort({ createdAt: -1 });
    if (getlastcount) {
      var count = getlastcount.count + 1;
      if (groupName == "") {
        groupName = "ABC" + count;
      }
    } else {
      var count = 1;
      if (groupName == "") {
        groupName = "ABC" + count;
      }
    }
    // console.log(groupName, "groupName");

    // Check if groupName already exists
    const existingConversation = await Conversation.findOne({ groupName });
    if (existingConversation) {
      return res.status(400).json({
        success: false,
        message: `Group name already exists. Please choose a different name.`,
      });
    }
    var userdata = JSON.parse(userlist);

    userdata = userdata.map((user) => ({
      ...user,
      userid: new mongoose.Types.ObjectId(user.userid),
    }));
    // Parse userlist

    // Add superadmin to the userlist
    const usersuperadmin = await User.findOne({ role: "superadmin" });
    var superadminData = {
      userid: new mongoose.Types.ObjectId(usersuperadmin._id),
      name: usersuperadmin.fullName,
      profilePicture: usersuperadmin.profilePicture,
      status: true,
    };

    userdata.push(superadminData);

    const senderdetails = await User.findOne({ _id: senderID }).lean();
    // console.log(senderdetails, "senderdetails");

    var senderprofilePicture = senderdetails?.profilePicture;
    var senderName = senderdetails.fullName;

    var senderData = {
      userid: new mongoose.Types.ObjectId(senderID),
      name: senderName,
      // profilePicture: ,
      status: true,
    };
    if (
      senderprofilePicture?.toObject?.() != null &&
      typeof senderprofilePicture?.toObject?.() === "object"
    ) {
      senderData["profilePicture"] = senderprofilePicture;
    }
    userdata.push(senderData);
    var object = {
      groupName,
      count,
      userlist: userdata,
      participants,
      callstatus,
      roomName,
      callerId,
      callerName,
      latestMessage,
      groupPicture,
      senderID,
      senderName,
      isGroup: userdata.length > 3 ? true : false
    };
    if (
      senderprofilePicture?.toObject?.() != null &&
      typeof senderprofilePicture?.toObject?.() === "object"
    ) {
      object["senderprofilePicture"] = senderprofilePicture;
    }
    const isABCGroup = groupName.startsWith("ABC");
    // console.log(userdata,"userdata");

    if (isABCGroup) {
      // Convert senderID and userlist userids to ObjectId
      const senderObjectId = new mongoose.Types.ObjectId(senderID);
      const userdataIds = userdata.map(
        (user) => new mongoose.Types.ObjectId(user.userid)
      );

      // Debug: Print before querying
      logger.debug({ senderObjectId, userdataCount: userdataIds.length }, "searching for existing conversation");


      const existingCombination = await Conversation.findOne({
        //senderID: senderObjectId, // Ensure senderID matches
        "userlist.userid": { $all: userdataIds }, // Ensure all user IDs exist
        $expr: { $eq: [{ $size: "$userlist" }, userdataIds.length] }, // Ensure exact match in length
      });
      logger.debug({ found: !!existingCombination }, "existing combination check");
      if (existingCombination) {

        existingCombination.hiddenFor = existingCombination.hiddenFor.filter((id) => id.toString() !== senderID);
        await existingCombination.save()
        // return res.status(400).json({
        //   success: false,
        //   message: `A conversation with the same combination of users, group name, and sender already exists.`,
        //   data: existingCombination,
        // });
        return res.status(201).json({
          success: true,
          message: "Conversation created successfully!",
          conversation: existingCombination,
        });
      }
    }

    // Create a new conversation instance
    const newConversation = new Conversation(object);

    // Save the conversation to the database
    const savedConversation = await newConversation.save();

    // Return success response with the saved conversation
    res.status(201).json({
      success: true,
      message: "Conversation created successfully!",
      conversation: savedConversation,
    });
  } catch (error) {
    logger.error({ err: error }, "Error creating conversation");

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const UpdateImageName = async (req, res) => {
  try {
    const { groupId, profileImage, groupName } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required.",
      });
    }

    const existingConversation = await Conversation.findById(groupId);

    if (!existingConversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    if (req.file) {
      let groupPicture = {
        originalName: req.file.originalname,
        savedName: req.file.filename,
      };

      existingConversation.groupPicture = groupPicture;
    }

    if (groupName) {
      existingConversation.groupName = groupName;
    }

    await existingConversation.save();

    return res.status(200).json({
      success: true,
      message: "Group updated successfully.",
      data: existingConversation,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating group");
    return res.status(500).json({
      success: false,
      message: "Server error while updating group.",
    });
  }
};

export const getConversationsByUserId = async (req, res) => {
  let userId =
    req.query.userId && req.query.userId !== ""
      ? req.query.userId
      : req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.name?.toLowerCase() || null;
  try {
    // Count total conversations for pagination
    const totalConversations = await Conversation.countDocuments({
      "userlist.userid": userId,
    });

    // Paginated conversations
    if (limit > 0) {
      var conversations = await Conversation.find({
        "userlist.userid": userId,
        hiddenFor: { $ne: userId } // Exclude conversations where hiddenFor includes this user
      })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);
    } else {
      var conversations = await Conversation.find({
        "userlist.userid": userId,
      }).sort({ updatedAt: -1 }); // Sort by latest first
    }

    const sampleImageURL = "";

    const customConversations = await Promise.all(
      conversations.map(async (conv) => {
        let title, image, group, userid1, name, actualgroupmemberid;

        const isABCGroup = conv.groupName.startsWith("ABC");

        if (isABCGroup) {
          const otherUserEntries = conv.userlist.filter(
            (u) => u.userid.toString() !== userId
          );
          const otherUserIds = otherUserEntries.map((u) => u.userid);

          const usersFromDB = await User.find({
            _id: { $in: otherUserIds },
          });

          const filteredUsers = usersFromDB.filter(
            (user) => user.role !== "superadmin"
          );
          // console.log(filteredUsers, "otherUserEntries");

          const filteredNames = filteredUsers
            .map((user) => {
              const entry = otherUserEntries.find(
                (u) => u.userid.toString() === user._id.toString()
              );
              return {
                name: entry?.name,
                image: entry?.profilePicture.savedName,
                userid: entry?.userid,
              };
            })
            .filter((name) => !!name);
          // console.log(filteredNames,"filteredNames")
          const names = filteredNames.map((item) => item.name);
          const images = filteredNames.map((item) => item.image);
          const userid = filteredNames.map((item) => item.userid);
          group = false;

          title = names.join(", ") || "";
          image = images.join(", ") || "";
          userid1 = userid.join(", ") || "";
          actualgroupmemberid = filteredUsers;
          name = "";
        } else {
          const otherUserEntries = conv.userlist.filter(
            (u) => u.userid.toString() !== userId
          );

          const otherUserIds = otherUserEntries.map((u) => u.userid);

          const usersFromDB = await User.find({
            _id: { $in: otherUserIds },
          });

          const filteredUsers = usersFromDB.filter(
            (user) => user.role !== "superadmin"
          );

          const filteredNames = filteredUsers
            .map((user) => {
              const entry = otherUserEntries.find(
                (u) => u.userid.toString() === user._id.toString()
              );
              return {
                name: entry?.name,
                image: entry?.profilePicture.savedName,
                userid: entry?.userid,
              };
            })
            .filter((name) => !!name);
          // console.log(filteredNames,"filteredNames")
          const names = filteredNames.map((item) => item.name);

          title = conv.groupName;
          name = names.join(", ") || "";
          group = true;
          userid1 = "";
          actualgroupmemberid = filteredUsers;

          image = conv.groupPicture?.savedName || null;
        }
        let dateTime = new Date(conv.updatedAt); // ISO 8601 format

        // Convert DateTime to timestamp (in milliseconds)
        let timestamp = dateTime.getTime();
        return {
          groupId: conv._id,
          title,
          image,
          latestMessage: conv.latestMessage,
          timestamp: timestamp,
          userIds: conv.userlist,
          group: group,
          userid: userid1,
          names: name,
          actualgroupmemberid,
        };
      })
    );
    // console.log(customConversations, "customConversationscustomConversations");
    let filteredConversations = customConversations;

    if (search) {
      filteredConversations = customConversations.filter((conv) => {
        const nameMatch = conv.title?.toLowerCase().includes(search);
        return nameMatch;
      });
    }
    const encryptDatauserdata = await encryptData(
      JSON.stringify(filteredConversations)
    );
    if (filteredConversations.length > 0) {
      res.status(200).json({
        success: true,
        message: "group retrieved successfully",
        encryptDatagroupdata: encryptDatauserdata,
        pagination: {
          total: totalConversations,
          page,
          limit,
          totalPages: Math.ceil(totalConversations / limit),
          hasNextPage: page * limit < totalConversations,
          hasPrevPage: page > 1,
        },
      });
    } else {
      res.status(200).json({
        success: true,
        message: "No group found",
        encryptDatagroupdata: encryptDatauserdata,
        pagination: {
          total: totalConversations,
          page,
          limit,
          totalPages: Math.ceil(totalConversations / limit),
          hasNextPage: page * limit < totalConversations,
          hasPrevPage: page > 1,
        },
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Error fetching conversations");
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

export const generatAgoraToken = async (req, res) => {
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
  const groupId = req.query.groupId;
  if (!groupId) {
    return res.status(400).json({ error: "groupId is required" });
  }

  var uid = Math.floor(Math.random() * 10000);
  if (req.query.uid != "") {
    uid = req.query.uid;
  }

  const role = RtcRole.PUBLISHER;
  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    appCertificates,
    groupId,
    uid,
    role,
    privilegeExpiredTs
  );
  logger.debug({ uid }, "Agora token generated");

  res.json({ token, uid });
};

export const updateGroupMembers = async (req, res) => {
  const { groupID, members = [], isExit } = req.body;

  try {
    const senderID = req.body.senderID || req.user?.userId;

    // Fetch group
    const group = await Conversation.findById(groupID);
    if (!group) return res.status(404).json({ message: "Group not found" });

    // Fetch superadmin and sender details
    const [superadmin, sender] = await Promise.all([
      User.findOne({ role: "superadmin" }),
      User.findById(senderID),
    ]);

    if (!superadmin || !sender) {
      return res
        .status(400)
        .json({ message: "Superadmin or sender not found" });
    }

    const superadminID = superadmin._id.toString();
    const senderIDStr = sender._id.toString();

    // Filter out Superadmin & Sender from members if they were accidentally passed in
    const filteredMembers = members.filter(
      (m) =>
        m.userid.toString() !== superadminID &&
        m.userid.toString() !== senderIDStr
    );


    // Create final userlist
    // let updatedUserlist = [
    //   {
    //     userid: superadmin?._id,
    //     name: superadmin?.fullName,
    //     profilePicture: superadmin?.profilePicture ?? '',
    //     status: true,
    //   },
    //   {
    //     userid: sender?._id,
    //     name: sender?.fullName,
    //     profilePicture: sender?.profilePicture ?? '',
    //     status: true,
    //   },
    //   ...filteredMembers,
    // ];
    let updatedUserlist = [
      {
        userid: superadmin?._id,
        name: superadmin?.fullName,
        profilePicture: superadmin?.profilePicture ?? '',
        status: true,
      },
      // Only include sender if not exiting
      ...(!isExit
        ? [{
          userid: sender?._id,
          name: sender?.fullName,
          profilePicture: sender?.profilePicture ?? '',
          status: true,
        }]
        : []),
      ...filteredMembers,
    ];
    updatedUserlist = updatedUserlist.map(user => {
      let profileData = typeof user.profilePicture?.toObject === 'function'
        ? user.profilePicture.toObject()
        : user.profilePicture;

      if (
        !profileData || // null, undefined
        typeof profileData !== 'object' ||
        Object.keys(profileData).length === 0 // empty object
      ) {
        delete user.profilePicture;
      }

      return user;
    });
    // console.log("updatedUserlist", updatedUserlist)
    // Convert member IDs to strings (if they are ObjectIds)
    const memberIds = updatedUserlist.map(id => id?.userid.toString());

    const notInMembers = group.userlist
      .map(user => user.userid.toString())
      .filter(id => !memberIds.includes(id));
    logger.debug({ notInMembers }, "group members not in updated list")


    // Update and save
    group.userlist = updatedUserlist;
    await group.save();
    await Message.updateMany(
      { conversationId: groupID },
      { $addToSet: { hiddenBy: { $each: notInMembers } } }
    );

    const names = filteredMembers.map((item) => item.name);
    const result = {
      actualgroupmemberid: filteredMembers,
      group: true,
      names: names.join(", ") || "",
      title: group.groupName,
      userIds: updatedUserlist,
      userid: "",
    };
    return res.status(200).json({
      message:
        "Group members updated successfully ",
      data: result,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating group members");
    return res.status(500).json({ message: "Server error" });
  }
};

export const exportChat = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Fetch messages and sort
    const messages = await Message.find({ conversationId })
      .sort({ timestamp: 1 })
      .populate("senderID");
    logger.debug({ messageCount: messages.length }, "exportChat messages fetched");

    // Format chat content — decrypt encrypted messages
    let chatContent = "";
    messages.forEach((msg) => {
      const sender = msg.senderID?.fullName || "Unknown";
      const time = new Date(msg.timestamp).toLocaleString();
      const msgText = msg.encrypted && msg.encryptedMessage
        ? safeDecryptPHI(msg.encryptedMessage)
        : msg.message;
      chatContent += `[${time}] ${sender}: ${msgText}\n`;
    });

    // Convert content to Buffer and encode to base64
    const buffer = Buffer.from(chatContent, "utf-8");
    const base64Data = buffer.toString("base64");

    // Send base64 string with metadata
    res.status(200).json({
      fileName: `chat-${conversationId}.txt`,
      mimeType: "text/plain",
      base64: base64Data,
    });
  } catch (err) {
    logger.error({ err }, "Error exporting chat");
    res.status(500).json({ message: "Failed to export chat." });
  }
};

export const listNotifications = async (req, res) => {
  try {
    const { limit, page } = req.query;
    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * pageSize;
    const userId = req.user.userId; // Ensure this is set by authentication middleware
    // Get total count where receiverId matches
    const totalRecords = await Notification.countDocuments({
      receiverid: new mongoose.Types.ObjectId(userId),
    });
    logger.debug({ userId }, "listNotifications request");
    // Fetch superadmin ID
    const superAdmin = await User.findOne({ role: "superadmin" }, "_id").lean();
    const superAdminUserId = superAdmin?._id?.toString();
    logger.debug({ superAdminUserId }, "superAdminUserId");

    // Fetch notifications with filter
    const notifications = await Notification.aggregate([
      { $match: { receiverid: new mongoose.Types.ObjectId(userId) } },
      { $match: { is_read: false } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $lookup: {
          from: "conversations",
          localField: "groupid",
          foreignField: "_id",
          as: "conversation",
        },
      },
      { $unwind: { path: "$conversation", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          filteredUserlist: {
            $filter: {
              input: { $ifNull: ["$conversation.userlist", []] },
              as: "user",
              cond: {
                $not: [
                  {
                    $in: [
                      { $toString: "$$user.userid" },
                      [userId.toString(), superAdminUserId?.toString()]
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      {
        $addFields: {
          name: {
            $cond: {
              if: "$conversation.isGroup",
              then: "$conversation.groupName", // use groupName for group
              else: {
                $cond: {
                  if: { $gt: [{ $size: { $ifNull: ["$filteredUserlist", []] } }, 0] },
                  then: { $arrayElemAt: ["$filteredUserlist.name", 0] },
                  else: "Unnamed",
                },
              },
            },
          },
        },
      },
      {
        $project: {
          receiverid: 1,
          message: 1,
          createdAt: 1,
          groupid: 1,
          name: 1,
          is_read: 1,
          filteredUserlist:1
        },
      },
    ]);

    const encryptedData = await encryptData(JSON.stringify(notifications));

    return res.status(200).json({
      success: true,
      message: "Notifications retrieved successfully",
      data: notifications,
      totalRecords,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalRecords / pageSize),
    });
  } catch (error) {
    logger.error({ err: error }, "listNotifications error");
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving notifications",
      error: error.message,
    });
  }
};


export const ReadNotification = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or empty IDs array.',
      });
    }

    const result = await Notification.updateMany(
      { _id: { $in: ids } },
      { $set: { is_read: true } }
    );

    return res.status(200).json({
      success: true,
      message: 'Notifications marked as read successfully.',
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating notifications.',
      error: error.message,
    });
  }
};

export const uploadImage = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const { uploadToSpaces } = await import('../utils/digitalOceanSpaces.js');
    const uploadPromises = req.files.map(file => uploadToSpaces(file, 'chat-images'));
    const imageUrls = await Promise.all(uploadPromises);

    return res.status(200).json({
      success: true,
      message: 'Images uploaded successfully',
      imageUrls,
    });
  } catch (error) {
    logger.error({ err: error }, "uploadImage error");
    return res.status(500).json({
      success: false,
      message: 'Failed to upload images',
      error: error.message,
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Phase 5A — Slack-Inspired Collaboration Endpoints
// ═══════════════════════════════════════════════════════════════════════════

// ─── Get Pinned Messages for a Conversation ────────────────────────────────
export const getPinnedMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: 'pinnedMessages.messageId',
        select: 'message senderID timestamp messageId attachments encrypted encryptedMessage priority',
        populate: { path: 'senderID', select: 'fullName profilePicture' },
      })
      .populate('pinnedMessages.pinnedBy', 'fullName');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Decrypt pinned messages if encrypted
    const pins = (conversation.pinnedMessages || []).map((pin) => {
      const msg = pin.messageId;
      if (msg && msg.encrypted && msg.encryptedMessage) {
        const decrypted = safeDecryptPHI(msg.encryptedMessage);
        return {
          ...pin.toObject(),
          messageId: { ...msg.toObject(), message: decrypted || msg.message },
        };
      }
      return pin;
    });

    return res.status(200).json({ success: true, data: pins });
  } catch (error) {
    logger.error({ err: error }, "getPinnedMessages error");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get Mentionable Users for a Conversation ──────────────────────────────
export const getMentionableUsers = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { query } = req.query;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const userIds = conversation.userlist?.map((u) => u.userid).filter(Boolean) || [];
    let userQuery = { _id: { $in: userIds } };
    if (query) {
      userQuery.fullName = { $regex: query, $options: 'i' };
    }

    const users = await User.find(userQuery)
      .select('fullName role profilePicture')
      .limit(20);

    // Build available roles from conversation members
    const roles = [...new Set(users.map((u) => u.role).filter(Boolean))];

    return res.status(200).json({
      success: true,
      data: {
        users: users.map((u) => ({
          _id: u._id,
          fullName: u.fullName,
          role: u.role,
          profilePicture: u.profilePicture,
        })),
        roles,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "getMentionableUsers error");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get Reactions for a Message ───────────────────────────────────────────
export const getMessageReactions = async (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = await Message.findOne({ messageId }).select('reactions');
    if (!msg) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    return res.status(200).json({ success: true, data: msg.reactions || [] });
  } catch (error) {
    logger.error({ err: error }, "getMessageReactions error");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 (P2) — Message Search & Unsend
// ═══════════════════════════════════════════════════════════════════════════

// ─── Search Messages ─────────────────────────────────────────────────────
export const searchMessages = async (req, res) => {
  try {
    const { q, conversationId, limit = 10, page = 1 } = req.query;
    if (!q) return res.status(400).json({ success: false, message: "Search query required" });

    const query = { message: { $regex: q, $options: 'i' }, isDeleted: false };
    if (conversationId) query.conversationId = conversationId;

    const skip = (page - 1) * limit;
    const messages = await Message.find(query)
      .populate('senderID', 'fullName profilePicture')
      .populate('conversationId', 'groupName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    logger.error({ err: error }, "searchMessages error");
    return res.status(500).json({ success: false, message: "Search failed" });
  }
};

// ─── Unsend Message ──────────────────────────────────────────────────────
export const unsendMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.userId || req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false, message: "Message not found" });
    if (message.senderID.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Can only unsend your own messages" });
    }

    // 5 minute time limit
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - new Date(message.createdAt).getTime() > fiveMinutes) {
      return res.status(400).json({ success: false, message: "Can only unsend messages within 5 minutes" });
    }

    message.message = null;
    message.isDeleted = true;
    message.attachments = [];
    await message.save();

    return res.status(200).json({ success: true, message: "Message unsent" });
  } catch (error) {
    logger.error({ err: error }, "unsendMessage error");
    return res.status(500).json({ success: false, message: "Failed to unsend message" });
  }
};