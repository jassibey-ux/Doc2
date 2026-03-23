import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import Message from "./src/models/message"; // Adjust the import path if necessary
import Conversation from "./src/models/Conversation"; // Adjust the import path if necessary
const config = require("./config/Config").get(process.env.NODE_ENV);
const { redis_data } = config;
import Notification from "./src/models/notification";
import User from "./src/models/user";
import { sendAndroidVoipCall, sendAndroidNonVoipCall, sendIosVoipCall, sendPriorityNotification } from "./src/utils/firebase_fcm"
import { encryptPHI, safeDecryptPHI } from "./src/utils/phiEncryption"
import EscalationChain from "./src/models/EscalationChain";
import mongoose from "mongoose";
import cron from "node-cron"
import { findOnCallNow } from "./src/scheduleManagement/Controller";

// Connect to Redis
const redisUrl = process.env.REDIS_URL;
const redisOptions = {
  host: process.env.REDIS_HOST || redis_data.host || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || redis_data.port || 6379,
  connectTimeout: 5000,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
};

// Create Redis clients
const pub = new Redis(redisUrl || redisOptions);
const sub = new Redis(redisUrl || redisOptions);
const redis = new Redis(redisUrl || redisOptions);

redis.once("connect", async () => {
  try {
    const info = await redis.info("replication");
    if (info.includes("role:slave")) {
      console.warn("⚠️ Redis started as REPLICA. Forcing to MASTER...");
      await redis.slaveof("NO", "ONE");
      console.log("✅ Redis set to MASTER successfully.");
    } else {
      console.log("✅ Redis already in MASTER mode.");
    }
  } catch (err) {
    console.error("❌ Failed to check/set Redis role:", err);
  }
});

setInterval(async () => {
  try {
    const info = await redis.info("replication");
    if (info.includes("role:slave")) {
      console.warn("⚠️ Redis changed to REPLICA! Forcing back to MASTER...");
      await redis.slaveof("NO", "ONE");
      console.log("✅ Redis switched back to MASTER.");
    }
    else {
      console.log("✅ Redis already in MASTER mode.");
    }
  } catch (err) {
    console.error("❌ Redis role auto-recovery failed:", err);
  }
}, 30000); // every 30 seconds
// ✅ Log Redis connection status
pub.on("connect", () => console.log("✅ Redis Publisher Connected!"));
sub.on("connect", () => console.log("✅ Redis Subscriber Connected!"));
redis.on("connect", () => console.log("✅ Redis Client Connected!"));

const handleRedisError = (clientName) => (err) => {
  console.error(`❌ Redis ${clientName} connection error:`, err);
};

pub.on("error", handleRedisError("Publisher"));
sub.on("error", handleRedisError("Subscriber"));
redis.on("error", handleRedisError("Client"));

// ✅ Reconnect handling
const handleReconnect = (clientName) => () => {
  console.warn(`⚠️ Redis ${clientName} is reconnecting...`);
};

pub.on("reconnecting", handleReconnect("Publisher"));
sub.on("reconnecting", handleReconnect("Subscriber"));
redis.on("reconnecting", handleReconnect("Client"));

redis.on("connect", () => console.log("✅ Connected to Redis successfully!"));
redis.on('error', (err) => {
  if (err.message.includes('READONLY')) {
    console.error('Redis is in READONLY mode. Taking corrective actions...');
    // Optionally: retry, send alert, or fallback to degraded functionality
    // Optionally start a retry loop to restore writes
    tryToRecoverRedisMaster();
  }
});

async function tryToRecoverRedisMaster() {
  try {
    await redis.send_command('SLAVEOF', ['NO', 'ONE']);
    console.log('Forced Redis to become master');
  } catch (err) {
    console.warn('Failed to recover Redis master state. Will retry in 10s');
    setTimeout(tryToRecoverRedisMaster, 10000); // Retry after delay
  }
}

const getAttachmentPreviewName = (attachments = []) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return "Attachment";

  const firstAttachment = attachments[0] || {};
  const attachmentName = firstAttachment?.name;
  if (attachmentName && typeof attachmentName === "string") {
    return attachmentName;
  }

  const attachmentData = firstAttachment?.data;
  if (attachmentData && typeof attachmentData === "string") {
    const lastPart = attachmentData.split("/").pop()?.split("?")[0];
    if (lastPart) {
      try {
        return decodeURIComponent(lastPart);
      } catch (_e) {
        return lastPart;
      }
    }
  }

  return "Attachment";
};

const getMessagePreviewText = (message, attachments = []) => {
  return typeof message === "string" && message.trim() !== ""
    ? message
    : getAttachmentPreviewName(attachments);
};

async function runningCronPriorityMessage(
  paylaod,
  io
) {
  try {

    cron.schedule("*/10 * * * * *", async () => {
      const { message_id, messageData, senderID, obj1 } = paylaod
      // let getData = await Message.findOne({
      //   _id: new mongoose.Types.ObjectId(message_id),
      // });

      let conversationDetail = await Conversation.findOne({
        _id: new mongoose.Types.ObjectId(messageData.groupId),
      })
      const tokens = await Conversation.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(messageData.groupId) } },
        { $unwind: "$userlist" },
        {
          $lookup: {
            from: "users",
            localField: "userlist.userid",
            foreignField: "_id",
            as: "user"
          }
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $match: {
            "user.fcm_token": { $exists: true, $ne: null, $ne: "" },
            "user._id": { $ne: senderID }
          }
        },
        {
          $project: {
            _id: 0,
            fcmToken: "$user.fcm_token",
            user: "$user"
          }
        }
      ]);
      const fcmTokenList = tokens.map(doc => doc.fcmToken);
      // console.log("📱 FCM Tokens:", fcmTokenList);
      if (fcmTokenList.length > 0) {
        const msgPriorityVal = messageData.priority || 'ROUTINE';
        sendPriorityNotification(
                fcmTokenList,
                msgPriorityVal === 'CRITICAL' ? 'CRITICAL Alert' : msgPriorityVal === 'URGENT' ? 'Urgent Message' : 'New Message',
                getMessagePreviewText(messageData.message, messageData.attachments),
                messageData.groupId,
                senderID,
                msgPriorityVal
              );
      }

      for (const user of conversationDetail.userlist) {
        if (user.userid != senderID) {
          var count = await redis.hget("unread_counts", `${messageData.groupId}:${user.userid}`);
          if (count > 0) {
            const socketId = await redis.hget('user_sockets', user.userid);
            console.log("working socjet ====", user.name, count, socketId)
            io.to(socketId).emit("reminder-message", {
              senderID: senderID,
              message: obj1,
            });
          }
        }

      }

    });
  } catch (err) {
    throw err;
  }
}

const jwt = require("jsonwebtoken");

exports = module.exports = function (io) {
  console.log("Socket.IO initialized");

  // Use Redis adapter for scaling
  io.adapter(createAdapter(pub, sub));

  // Socket.IO authentication middleware — ENFORCED
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error("Authentication required"));
      }
      const decoded = jwt.verify(token, config.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      console.warn("Socket auth rejected:", err.message);
      return next(new Error("Invalid or expired token"));
    }
  });

  const users = new Map(); // Store userId -> socketId mapping in-memory

  // ─── CRITICAL Message Escalation Cron (every 2 minutes) ──────────────────
  cron.schedule("*/2 * * * *", async () => {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      // Find unacknowledged CRITICAL messages older than 5 minutes
      const unacked = await Message.find({
        priority: 'CRITICAL',
        acknowledgedAt: { $exists: false },
        createdAt: { $lte: fiveMinAgo },
      }).populate('conversationId').limit(50);

      for (const msg of unacked) {
        const conversation = msg.conversationId;
        if (!conversation) continue;

        // Find escalation chains for this facility
        const facilityUser = conversation.userlist?.find(u => u.userid);
        if (!facilityUser) continue;

        const chains = await EscalationChain.find({ isActive: true }).limit(5);
        for (const chain of chains) {
          // Find next step not yet notified
          for (const step of chain.steps) {
            if (step.delayMinutes <= 5) {
              // Resolve target user
              let targetUserId = step.userId;
              if (!targetUserId && step.role) {
                const onCall = await findOnCallNow(null, { facilityId: chain.facilityId, role: step.role });
                targetUserId = onCall?.userId;
              }
              if (!targetUserId) continue;

              const targetUser = await User.findById(targetUserId);
              if (!targetUser) continue;

              const fcmToken = targetUser.fcm_token;
              if (fcmToken) {
                sendPriorityNotification(
                  [fcmToken],
                  'ESCALATION: Unacknowledged Alert',
                  `A CRITICAL message has not been acknowledged for ${Math.round((Date.now() - msg.createdAt) / 60000)} minutes`,
                  conversation._id?.toString(),
                  msg.senderID?.toString(),
                  'CRITICAL'
                );
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Escalation cron error:", err.message);
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    console.log("User connected123:");
    // Register user in Redis
    socket.on("register", async (userId) => {
      if (!userId) return;

      const socketId = socket.id;
      users.set(userId, socketId); // (Optional local memory map)

      // Add socket to Redis set for this user
      await redis.sadd(`sockets:${userId}`, socketId);

      // If user is not already online, mark as online
      const isAlreadyOnline = await redis.sismember("online_users", userId);
      var dataaa = await redis.smembers("online_users");
      console.log(isAlreadyOnline, "isAlreadyOnlineisAlreadyOnline", userId, "dd", dataaa);

      if (!isAlreadyOnline) {
        await redis.sadd("online_users", userId);
        io.emit("userOnline", userId);
      }
      await redis.hset("user_sockets", userId, socketId); // Store 1 socket ID as main

      console.log(`User ${userId} registered with socket ${socketId}`);
 const pendingMessages = await redis.smembers(`user_pending:${userId}`);

  if (pendingMessages.length === 0) return;

  await Message.updateMany(
    { messageId: { $in: pendingMessages } },
    {
      $set: {
        status: 'DELIVERED',
        deliveredAt: new Date()
      }
    }
  );

  /* ===============================
     3️⃣ Sender ko notify
     =============================== */
  const messages = await Message.find(
    { messageId: { $in: pendingMessages } },
    { messageId: 1, senderID: 1, conversationId: 1 }
  );
  console.log("ddmessages",messages);
  
  for (const msg of messages) {
      const redisMessage = await redis.lrange(`messages:${msg.conversationId}`, 0, -1);
          let messageIndex = -1;
        for (let i = 0; i < redisMessage.length; i++) {
          const redismsg = JSON.parse(redisMessage[i]);
          if (redismsg.messageId === msg.messageId) {
            messageIndex = i;
            break;
          }
        }
         if (messageIndex === -1) {} else {
          // 4. Update the message content
          const updatedMessage = {
            ...JSON.parse(redisMessage[messageIndex]),
            status: "DELIVERED",
          };
          await redis.lset(`messages:${msg.conversationId}`, messageIndex, JSON.stringify(updatedMessage));
        }

       const senderSocket = await redis.hget("user_sockets", msg.senderID.toString());
              if (senderSocket) {
                io.to(senderSocket).emit("messageDelivered", {  messageId: msg.messageId,conversationId: msg.conversationId});
              }
  }

  /* ===============================
     4️⃣ Clear pending
     =============================== */
  await redis.del(`user_pending:${userId}`);
  

    });

    socket.on("getOnlineUsers", async (callback) => {
      const onlineUsers = await redis.smembers("online_users");
      console.log("getOnlineUsers", onlineUsers);

      callback(onlineUsers);
    });

    socket.on("setpagename", async ({ loginid, groupid }) => {
      console.log(loginid, "loginid", groupid, "groupidgroupid");

      if (groupid != '') {
        await redis.set(
          `onpage:${loginid}${groupid}`,
          true
        );
      }
      else {
        await redis.set(
          `onpage:${loginid}`,
          true
        );
      }
    });

    socket.on("leavepagename", async ({ loginid, groupid }) => {
      console.log(loginid, "leavepagenameloginid", groupid, "groupidgroupid");

      if (groupid != '') {
        await redis.del(
          `onpage:${loginid}${groupid}`
        );
      }
      else {


        await redis.del(
          `onpage:${loginid}`
        );
      }
    });

    socket.on("participantinfo", async ({ loginuserdetails, uid, groupId }) => {
      // 🛡 Validate inputs
      if (!loginuserdetails || !uid || !groupId) {
        console.log(`loginuserdetailsparticipantinfo`, loginuserdetails, uid, groupId);
        return;
      }

      var participantinfo = await redis.get(
        `participantinfo:${groupId}`
      );
      console.log(`loginuserdetailsparticipantinfo`, participantinfo);

      if (participantinfo != null) {
        var participant = JSON.parse(participantinfo).participant
        const user = participant.find(u => u.uid === uid);
        if (!user) {
          participant.push({
            uid: uid,
            loginuserdetails: loginuserdetails
          })
        }
        await redis.set(
          `participantinfo:${groupId}`,
          JSON.stringify({
            status: "active",
            participant: participant,
          })
        );

      }
      else {
        var participant = {
          uid: uid,
          loginuserdetails: loginuserdetails
        }
        await redis.set(
          `participantinfo:${groupId}`,
          JSON.stringify({
            status: "active",
            participant: [participant],
          })
        );
      }
    });


    // Create group and add users
    socket.on("createGroup", async (groupId, members) => {
      if (!groupId || !Array.isArray(members) || members.length === 0) {
        console.warn("Invalid groupId or members:", { groupId, members });
        return;
      }
      console.log(`Group ${groupId} created with members111111:`, members);

      for (const userId of members) {
        const userSocketId = await redis.hget("user_sockets", userId);
        console.log(userSocketId, "userSocketId");

        if (userSocketId) {
          io.sockets.sockets.get(userSocketId)?.join(groupId);
          console.log(`User ${userId} added to group ${groupId}`);
        }
      }

      // Store group membership in Redis
      await redis.sadd(`group:${groupId}`, ...members);

      // Notify group members
      for (const userIdmew of members) {

        const userSocketId = await redis.hget("user_sockets", userIdmew);
        console.log(userSocketId, "dsfsfdsfdsfs", userIdmew);

        io.to(userSocketId).emit("groupJoined", { groupId, members });
      }
    });

    // socket.on("callstart", async ({ groupId, userids }) => {
    //   if (!groupId) {
    //     console.warn("Invalid groupId or userids:", { groupId });
    //     return;
    //   }
    //   console.log(groupId, userids, "ffffffff");
    //   io.to(groupId).emit("callstarted", { groupId });
    // });
    socket.on(
      "ringstart",
      async ({
        groupId,
        loginid,
        callerName,
        callerImage,
        activegrouuserids,
        audio,
        isGroup = false
      }) => {
        if (
          !groupId ||
          !loginid ||
          !callerName ||
          !Array.isArray(activegrouuserids) ||
          activegrouuserids.length === 0
        ) {
          console.warn("Invalid ringstart data:", {
            groupId,
            loginid,
            callerName,
            activegrouuserids
          });
          return;
        }

        await redis.set(
          `call:${groupId}`,
          JSON.stringify({
            status: "ringing",
            // callerId: loginid,
            // callerName:callerName?callerName:'',
            // callerImage:callerImage?callerImage:'',
            // activegrouuserids,
            audio,
            participant: [],
          })
        );
        io.to(groupId).emit("ringerstarted", {
          groupId,
          callerId: loginid,
          callerName,
          callerImage,
          activegrouuserids,
          audio,
          isGroup
        });
        const { ObjectId } = require('mongodb');
        const groupObjectId = new ObjectId(groupId);
        const callerObjectId = new ObjectId(loginid)
        const tokens = await Conversation.aggregate([
  { $match: { _id: groupObjectId } },
  { $unwind: "$userlist" },
  {
    $lookup: {
      from: "users",
      localField: "userlist.userid",
      foreignField: "_id",
      as: "user"
    }
  },
  {
    $unwind: {
      path: "$user",
      preserveNullAndEmptyArrays: false
    }
  },
  {
    $match: {
      "user._id": { $ne: callerObjectId },
      $or: [
        { "user.fcm_token": { $exists: true, $ne: null, $ne: "" } },
        { "user.device_token": { $exists: true, $ne: null, $ne: "" } }
      ]
    }
  },
  {
    $project: {
      _id: 0,
      fcmToken: "$user.fcm_token",
      deviceToken: "$user.device_token"
    }
  }
]);

        const fcmTokenList = tokens.filter(doc => doc.fcmToken).map(doc => doc.fcmToken);
        const deviceTokenList = tokens.filter(doc => doc.deviceToken).map(doc => doc.deviceToken);
        console.log("📱 FCM Tokens:", fcmTokenList);
        if (fcmTokenList.length > 0) {
          sendAndroidVoipCall(fcmTokenList, callerName, loginid, audio, groupId, isGroup,activegrouuserids);
        }
        if (deviceTokenList.length > 0) {
          sendIosVoipCall(deviceTokenList, callerName, loginid, audio, groupId, isGroup,activegrouuserids);
        }
      }
    );

    socket.on("joinparticipant", async ({ groupId, loginid, audio = false }) => {
      // 🛡 Validate inputs
      if (!groupId || !loginid) {
        console.warn("Invalid acceptCall data:", { groupId });
        return;
      }

      var callstatus = await redis.get(
        `call:${groupId}`
      );
      if (callstatus != null) {
        var participant = JSON.parse(callstatus).participant
        console.log(callstatus, "callstatuscallstatus", participant);
        if (participant.indexOf(loginid) == -1) {
          participant.push(loginid);
        }
        await redis.set(
          `call:${groupId}`,
          JSON.stringify({
            status: "active",
            participant: participant,
            audio
          })
        );
      }
    });



    socket.on("acceptCall", async ({ callerId, groupId, loginid, audio = false }) => {
      // 🛡 Validate inputs
      if (!callerId || !groupId || !loginid) {
        console.warn("Invalid acceptCall data:", { callerId, groupId });
        return;
      }
      console.log(`${callerId} accepted the call in ${groupId}`);

      var callstatus = await redis.get(
        `call:${groupId}`
      );
      if (callstatus != null) {
        var participant = JSON.parse(callstatus).participant
        console.log(callstatus, "callstatuscallstatus", participant);
        if (participant.indexOf(callerId) == -1) {
          participant.push(callerId);
        }
        if (participant.indexOf(loginid) == -1) {
          participant.push(loginid);
        }

        await redis.set(
          `call:${groupId}`,
          JSON.stringify({
            status: "active",
            callerId: callerId,
            participant: participant,
            audio
          })
        );
      }

      var callparticipant = await redis.get(
        `callingparticipantinfo`
      );
      if(callparticipant != null){
        var participant1 = JSON.parse(callparticipant).participant
        console.log(callparticipant, "callparticipant", participant1);
        if (participant1.indexOf(callerId) == -1) {
          participant1.push(callerId);
        }
        if (participant1.indexOf(loginid) == -1) {
          participant1.push(loginid); 
        }
        await redis.set(
          `callingparticipantinfo`,
          JSON.stringify({
            participant: participant1
          })
        );
      }else{
        participant1 = []
        if (participant1.indexOf(callerId) == -1) {
          participant1.push(callerId);
        }
        if (participant1.indexOf(loginid) == -1) {
          participant1.push(loginid); 
        }
        console.log(`participant1===`, participant1);
        await redis.set(
          `callingparticipantinfo`,
          JSON.stringify({
            participant: participant1
          })
        );
      }
      var calldurationstatus = await redis.get(
        `callduration:${groupId}`
      );
      console.log(calldurationstatus, "callstatuscallstatus");

      if (calldurationstatus == null) {
        const timestamp = Math.floor(Date.now() / 1000);
        console.log(timestamp);
        await redis.set(
          `callduration:${groupId}`,
          JSON.stringify({
            time: timestamp,
          })
        );
      }
      io.to(groupId).emit("callAccepted", { groupId, callerId, loginid, audio });
    });

    socket.on("rejectCall", async ({ callerId, groupId, loginid }) => {
      // 🛡️ Validate inputs
      if (!callerId || !groupId || !loginid) {
        console.warn("Invalid rejectCall data:", { callerId, groupId, loginid });
        return;
      }
      const existingConversation = await Conversation.findById(groupId);
      if (!existingConversation) {
        console.warn("Conversation not found for rejectCall:", { groupId });
        await redis.del(`call:${groupId}`);
        io.to(groupId).emit("callRejected", { groupId, callerId, groupmember: false, loginid });
        return;
      }

      if (!existingConversation.isGroup) {
        await redis.del(`call:${groupId}`);
      }
      io.to(groupId).emit("callRejected", { groupId, callerId, groupmember: existingConversation.isGroup, loginid });
    });

    socket.on("cancelcall", async ({ groupId, loginid }) => {
      if (!groupId || !loginid) {
        console.warn("Invalid cancelcall data:", { groupId, loginid });
        return;
      }
      await redis.del(`call:${groupId}`);
      const groupMembers = await redis.smembers(`group:${groupId}`);
      io.to(groupId).emit("callcancelled", { groupId, groupmember: groupMembers.length, loginid });
    });

    socket.on("leavecall", async ({ groupId, loginid, name, callerID, isGroup, audio }) => {
      console.log("leavecallllll");

      if (!groupId || !loginid) {
        console.warn("Invalid leavecall data:", { groupId, loginid });
        return;
      }
      const safeCallerId = (callerID && mongoose.Types.ObjectId.isValid(callerID)) ? callerID : loginid;
      const safeName = name || "Participant";
      var callstatus = await redis.get(
        `call:${groupId}`
      );
      console.log(callstatus, "callstatus");

      if (callstatus != null) {
        var participant = JSON.parse(callstatus)?.participant
        if (participant.indexOf(loginid) != -1) {
          participant.splice(participant.indexOf(loginid), 1)
        }
        if (participant.length > 0) {
          await redis.set(
            `call:${groupId}`,
            JSON.stringify({
              status: "active",
              participant: participant,
              audio: JSON.parse(callstatus).audio
            })
          );
        }
        else {
          var callstatus = await redis.get(
            `callduration:${groupId}`
          );
          if (callstatus != null) {
            // Get current timestamp in seconds
            const timestamp2 = Math.floor(Date.now() / 1000);
            const diffInSeconds = timestamp2 - JSON.parse(callstatus).time;
            const hours = Math.floor(diffInSeconds / 3600);
            const minutes = Math.floor((diffInSeconds % 3600) / 60);
            const seconds = diffInSeconds % 60;
            var value = audio ? 'Audio' : 'Video';

            try {
            const newMessage = new Message({
              senderID: safeCallerId, // The sender's user ID
              message: `${value} call has been completed. call duration: ${hours}h ${minutes}m ${seconds}s`, // The message content
              conversationId: groupId, // Assuming groupId is the conversationId
              isDeleted: false, // Initially set to false
              attachments: [],
              timestamp: Date.now(), // Add any attachments if required
              isImportant: false,// Add any attachments if required,
              video: true
            });

            // Save the message in MongoDB
            var result = await newMessage.save();
            const messageData = {
              _id: result._id,
              senderID: safeCallerId,
              senderDetails: result.senderID,
              message: `${value} call has been completed. call duration: ${hours}h ${minutes}m ${seconds}s`,
              timestamp: Date.now(),
              groupId,
              attachments: [],
              isImportant: false,// Add any attachments if required,
            };
            await redis.rpush(`messages:${groupId}`, JSON.stringify(messageData));
            } catch (msgErr) {
              console.error("❌ Failed to save call-end message for senderID:", safeCallerId, msgErr.message);
            }
          }
          await redis.del(`call:${groupId}`);
          await redis.del(`callduration:${groupId}`);
          await redis.del(`participantinfo:${groupId}`);
          await redis.del(`audioInfo:${groupId}`);


        }

      }
      var callparticipant = await redis.get(
        `callingparticipantinfo`
      );
      if (callparticipant != null) {
        var participant1 = JSON.parse(callparticipant)?.participant
        if (participant1.indexOf(loginid) != -1) {
          participant1.splice(participant1.indexOf(loginid), 1)
        }
        if (participant1?.length > 0){
          await redis.set(
          `callingparticipantinfo`,
          JSON.stringify({
            participant: participant1
          })
        );
        }else{
          await redis.del(`callingparticipantinfo`);

        }
      }

      io.to(groupId).emit("user-leave-call", {
        name: safeName,
        groupId: groupId, leaveuserid: loginid, isGroup: isGroup
      });
    });
    // prashant code start

    socket.on("joinChat", async ({ groupId, userId }) => {
      try {
        if (!groupId || !userId) {
          console.warn("Invalid joinChat data:", { groupId, userId });
          return;
        }
        // Reset unread count to 0 in Redis
        await redis.hset("unread_counts", `${groupId}:${userId}`, 0);

        console.log(`Unread count reset for ${userId} in group ${groupId}`);

        // Emit event to frontend for updating UI
        io.to(groupId).emit("unreadCountUpdated", {
          groupId,
          userId,
          count: 0, // Reset unread count to 0
        });
      } catch (err) {
        console.error("Error resetting unread count:", err);
      }
    });

    // ✅ User Leaves a Chat
    socket.on("leaveChat", async ({ userId }) => {
      if (!userId) {
        console.warn("Invalid leaveChat data: userId is missing");
        return;
      }
      await redis.hdel("active_chats", userId);
      console.log(`⚫ User ${userId} left the chat`);
    });
    // prashant code end
    // Handle messaging in group
    socket.on(
      "sendMessage",
      async ({ groupId, senderID, message, timestamp, attachment, isImportant, messageId, priority, onCallRole }) => {
        if (!groupId || !senderID || !timestamp || !messageId || attachment == undefined || isImportant == undefined) {
          console.warn("Invalid sendMessage data:", { groupId, senderID, message, timestamp, attachment });
          return;
        }

        // ─── Authorization: verify sender is a member of the conversation ───
        try {
          const conv = await Conversation.findById(groupId).select("userlist").lean();
          if (!conv) {
            socket.emit("messageError", { error: "not_found", message: "Conversation not found", messageId });
            return;
          }
          const isMember = conv.userlist?.some(
            (u) => u.userid?.toString() === senderID.toString()
          );
          if (!isMember) {
            socket.emit("messageError", { error: "unauthorized", message: "Not a member of this conversation", messageId });
            return;
          }
        } catch (authErr) {
          console.error("Socket auth check error:", authErr.message);
        }

        // Smart on-call routing: if onCallRole is provided, resolve to current on-call user
        if (onCallRole) {
          try {
            const conversation = await Conversation.findById(groupId);
            if (conversation?.facilityId) {
              const onCallEntry = await findOnCallNow(conversation.facilityId.toString(), onCallRole);
              if (onCallEntry?.userId?._id) {
                const onCallUserId = onCallEntry.userId._id.toString();
                // Add on-call user to the conversation if not already a member
                const alreadyMember = conversation.userlist?.some(
                  (u) => u.userid?.toString() === onCallUserId
                );
                if (!alreadyMember) {
                  conversation.userlist = conversation.userlist || [];
                  conversation.userlist.push({ userid: onCallEntry.userId._id });
                  await conversation.save();
                }
              }
            }
          } catch (err) {
            console.error("On-call routing error:", err.message);
          }
        }

        // let latestMessage = message || (audioMessageId ? " Audio Message" : "Attachment");
        let latestmessage = getMessagePreviewText(message, attachment);
        console.log(groupId, "groupId");
        let userId = senderID;
        const { ObjectId } = require('mongodb');
        const groupObjectId = new ObjectId(groupId);
        const callerObjectId = new ObjectId(userId)
        const tokens = await Conversation.aggregate([
          { $match: { _id: groupObjectId } },
          { $unwind: "$userlist" },
          {
            $lookup: {
              from: "users",
              localField: "userlist.userid",
              foreignField: "_id",
              as: "user"
            }
          },
          {
            $unwind: {
              path: "$user",
              preserveNullAndEmptyArrays: false
            }
          },
          {
            $match: {
              "user.fcm_token": { $exists: true, $ne: null, $ne: "" },
              "user._id": { $ne: callerObjectId }
            }
          },
          {
            $project: {
              _id: 0,
              fcmToken: "$user.fcm_token",
              userId: "$user._id",
            }
          }
        ]);
        const conversationGroup = await Conversation.findById(groupObjectId);
        const msgPriority = ['ROUTINE', 'URGENT', 'CRITICAL'].includes(priority) ? priority : 'ROUTINE';

        // Encrypt message content at rest
        let encryptedMsg = null;
        let storedMessage = message;
        try {
          if (message && process.env.PHI_ENCRYPTION_KEY) {
            encryptedMsg = encryptPHI(message);
            storedMessage = "[encrypted]"; // placeholder in plaintext field
          }
        } catch (encErr) {
          console.error("Message encryption failed, storing plaintext:", encErr.message);
        }

        const newMessage = new Message({
          senderID: userId,
          message: storedMessage,
          conversationId: groupId,
          isDeleted: false,
          attachments: attachment,
          timestamp: timestamp,
          isImportant,
          messageId: messageId,
          status: "SENT",
          priority: msgPriority,
          encrypted: !!encryptedMsg,
          encryptedMessage: encryptedMsg,
        });
        // Save the message in MongoDB
        var result = await newMessage.save();
        result = await result.populate('senderID');
        var callername = conversationGroup?.isGroup ? conversationGroup?.groupName :result?.senderID?.fullName;
        const messageData = {
          _id: result._id,
          senderID: userId,
          senderDetails: result.senderID,
          message: message,
          timestamp,
          groupId,
          attachments: attachment,
          isImportant,// Add any attachments if required
          messageId: messageId,
          status: "SENT",
          priority: msgPriority,
        };
        const MAX_MEMORY_BYTES = 200 * 1024 * 1024;
        const memoryUsage = await redis.call('MEMORY', 'USAGE', `messages:${groupId}`);
        console.log(memoryUsage, "memoryUsagememoryUsage", MAX_MEMORY_BYTES);

        if (memoryUsage > MAX_MEMORY_BYTES) {
          await redis.del(`messages:${groupId}`);
          console.log('Memory limit exceeded. Messages cleared.');
        }
        // // Store message in Redis list (optional)
        await redis.rpush(`messages:${groupId}`, JSON.stringify(messageData));
        //  Increment total message count in Redis
        // const messageCount = await redis.incr(`message_count:${groupId}`);
        // Broadcast message to group
        // io.to(groupId).emit("newMessage", { ...messageData, messageCount });

        // prashant code start

        // Update unread count for all group members in MongoDB (except sender)
        const groupMembers = await redis.smembers(`group:${groupId}`);
        console.log(groupMembers,"groupMembersgroupMembers");
        
        let updatedUnreadCounts = {};
        for (const userId of groupMembers) {
          if (userId !== senderID) {
            var checkpage = await redis.get(
              `onpage:${userId}${groupId}`
            );

            if (!checkpage) {
              // const activeChat = await redis.hget("active_chats", userId);
              // if (activeChat !== groupId) {
              await redis.hincrby("unread_counts", `${groupId}:${userId}`, 1);
              // await Conversation.updateOne(
              //   { _id: groupId },
              //   { $inc: { [`unreadCount.${userId}`]: 1 } }
              // );
              // Emit unread count update
              let newCount = await redis.hget("unread_counts", `${groupId}:${userId}`);
              updatedUnreadCounts[userId] = parseInt(newCount) || 0;
              // }
            }
          }
        }
        const hasAttachmentnew = attachment && attachment.length > 0; // if it's an array or not null
          console.log("testttghh113",Object.keys(updatedUnreadCounts))

        for (const userId of Object.keys(updatedUnreadCounts)) {
          const checkpage = await redis.get(`onpage:${userId}${groupId}`);
          console.log("testttghh115",checkpage)

          if (!checkpage && userId !== '') {
          console.log("testttghh116",userId)

             const usersuperadmin = await User.findOne({ role: "superadmin" });
            if (String(usersuperadmin._id) !== userId) {
            io.to(groupId).emit("unreadCountUpdated", {
              groupId,
              userId,
              count: updatedUnreadCounts[userId], // Send latest count
            });
            const fcmTokenList = tokens
                  .filter(doc => doc.userId.toString() === userId) // filter by userId
                  .map(doc => doc.fcmToken); 
                            console.log("📱 FCM Tokens:", fcmTokenList);

            if (fcmTokenList.length > 0) {
              const notifPriority = messageData?.priority || 'ROUTINE';
              sendPriorityNotification(
                fcmTokenList,
                callername,
                latestmessage,
                groupId,
                userId,
                notifPriority
              );
            }
          }
          }
          const isOnGroupPageForUser = await redis.get(`onpage:${userId}${groupId}`);
          console.log("testttghh11", isOnGroupPageForUser);

          if (
            !isOnGroupPageForUser &&
            userId !== '' &&
            senderID !== '' &&
            groupId !== '' &&
            senderID !== userId
          ) {
            console.log("testttghh112", isOnGroupPageForUser);

            const usersuperadmin = await User.findOne({ role: "superadmin" });
            if (String(usersuperadmin._id) !== userId) {
              console.log("testttghh114", userId);

              const notification = new Notification({
                message: latestmessage,
                groupid: groupId,
                receiverid: userId,
                is_read: false,
                createdid: senderID,
                priority: messageData?.priority || 'ROUTINE',
              });

              await notification.save();

              const unreadNotificationCount = await Notification.countDocuments({
                receiverid: userId,
                is_read: false,
              });

              const userSocketId = await redis.hget("user_sockets", userId);

              if (userSocketId) {
                io.to(userSocketId).emit("unreadnoti", {
                  groupId,
                  userId,
                  count: unreadNotificationCount,
                });
              }
            }
          }
        }


        // prashant code end
        if (messageData.isImportant) {
          console.log("newmessagessssssss");

          let obj1 = {
            message: "Priority Message Reminder",
          };
          runningCronPriorityMessage({ message_id: messageData._id, messageData, senderID, obj1 }, io)
        }
        const groupMembers11111 = await redis.smembers(`group:${groupId}`);
        groupMembers11111.forEach(element => {
          console.log(element, "elementelementelement");

        });
        console.log("newmessage");

        io.to(groupId).emit("newMessage", messageData);
        const usersuperadmin = await User.findOne({ role: "superadmin" });
        for (const memberId of groupMembers) {
          if (memberId !== senderID) {
            if (String(usersuperadmin._id) !== memberId) {
            const socketId = await redis.hget("user_sockets", memberId);

            if (socketId) {
              await Message.updateOne(
              { messageId },
              {
                status: "DELIVERED",
                deliveredAt: new Date()
              }
            );

             const messages = await redis.lrange(`messages:${groupId}`, 0, -1);
          let messageIndex = -1;
        for (let i = 0; i < messages.length; i++) {
          const msg = JSON.parse(messages[i]);
          if (msg.messageId === messageId) {
            messageIndex = i;
            break;
          }
        }
         if (messageIndex === -1) {
          console.warn(`Message with ID ${messageId} not found in Redis for group ${groupId}`);
        } else {
          // 4. Update the message content
          const updatedMessage = {
            ...JSON.parse(messages[messageIndex]),
            status: "DELIVERED",
          };

          // 5. Set updated message back to Redis list
          await redis.lset(`messages:${groupId}`, messageIndex, JSON.stringify(updatedMessage));
        }

              const senderSocket = await redis.hget("user_sockets", senderID);
              if (senderSocket) {
                io.to(senderSocket).emit("messageDelivered", { messageId,conversationId: groupId });
              }
            }
            else
            {
                  await redis.sadd(`user_pending:${memberId}`, messageId);
            }

            var checkpage = await redis.get(
              `onpage:${memberId}${groupId}`
            );

            if (checkpage) {
   const messages = await redis.lrange(`messages:${groupId}`, 0, -1);

          for (let i = 0; i < messages.length; i++) {
           var msg=messages[i];  
            const parsed = JSON.parse(msg);

            if (parsed.senderID !== memberId) {
              const senderSocket = await redis.hget("user_sockets", parsed.senderID);
              if (senderSocket) {
                  console.log("datadata");
                var messageId = parsed.messageId;
               var data=  await Message.updateOne(
                    { messageId },
                    {
                      status: "READ",
                      readAt: new Date()
                    }
                  );
                      const updatedMessage = {
                        ...JSON.parse(messages[i]),
                        status: "READ",
                      };
                  await redis.lset(`messages:${parsed.groupId}`, i, JSON.stringify(updatedMessage));
                io.to(senderSocket).emit("messageRead", {
                  messageId: parsed.messageId,
                  conversationId: parsed.groupId
                });
              }
            }
          }
            }
          }}
        }

        io.to(groupId).emit("updatedgroup", {
          timestamp,
          groupId,
          message: latestmessage,
        });

        // console.log(result, "fffllllllllllllllllllllllllllll");
        await Conversation.findOneAndUpdate(
          { _id: groupId }, // Find the conversation by groupId
          {
            latestMessage: latestmessage, // Set the latest message text
            updatedAt: timestamp, // Update the timestamp when the message was sent
          },
          { new: true } // Return the updated document
        );



        // Broadcast message to group
      }
    );

    //  prashant code start

    socket.on("markAsRead", async ({ groupId, userId }, callback) => {
      try {
        // Authorization: verify user is a member
        const convCheck = await Conversation.findById(groupId).select("userlist").lean();
        if (convCheck && !convCheck.userlist?.some((u) => u.userid?.toString() === userId.toString())) {
          return callback?.(new Error("Not a member of this conversation"));
        }

        // Validate inputs
        if (!groupId || !userId) {
          console.warn("Invalid markAsRead data:", { groupId, userId });
          return callback(new Error("Invalid data"));
        }
        console.log(
          `User ${userId} is marking messages as read in group ${groupId}`
        );

         const messages = await redis.lrange(`messages:${groupId}`, 0, -1);

            for (let i = 0; i < messages.length; i++) {
           var msg=messages[i]; 
            const parsed = JSON.parse(msg);

            if (parsed.senderID !== userId) {
              const senderSocket = await redis.hget("user_sockets", parsed.senderID);
              if (senderSocket) {
                  console.log("datadata");
                var messageId = parsed.messageId;
               var data=  await Message.updateOne(
                    { messageId },
                    {
                      status: "READ",
                      readAt: new Date()
                    }
                  );
                     const updatedMessage = {
                        ...JSON.parse(messages[i]),
                        status: "READ",
                      };
                  await redis.lset(`messages:${parsed.groupId}`, i, JSON.stringify(updatedMessage));
                io.to(senderSocket).emit("messageRead", {
                  messageId: parsed.messageId,
                  conversationId: parsed.groupId
                });
              }
            }
          }



        // Reset unread count in Redis
        await redis.hset(`unread_counts`, `${groupId}:${userId}`, 0);

        // Mark related notifications as read for this user/group
        await Notification.updateMany(
          {
            groupid: groupId,
            receiverid: userId,
            is_read: false,
          },
          {
            $set: {
              is_read: true,
            },
          }
        );

        const unreadNotificationCount = await Notification.countDocuments({
          receiverid: userId,
          is_read: false,
        });

        // Reset unread count in MongoDB
        // await Conversation.updateOne(
        //   { _id: groupId },
        //   { $set: { [`unreadCount.${userId}`]: 0 } }
        // );

        console.log(
          `Unread count reset for group ${groupId} and user ${userId}`
        );

        // Notify all clients about the update
        io.emit("unreadCountUpdated", { groupId, userId, count: 0 });

        const userSocketId = await redis.hget("user_sockets", userId);

        if (userSocketId) {
          io.to(userSocketId).emit("unreadnoti", {
            userId,
            count: unreadNotificationCount,
            groupId,
          });
        } else {
          io.emit("unreadnoti", { userId, count: unreadNotificationCount, groupId });
        }

        // Confirm completion
        callback();
      } catch (err) {
        console.error("Error marking messages as read:", err);
        callback(err);
      }
    });

      socket.on("getMessageStatus", async ({ messageId }, callback) => {
      const status = await redis.hget(`message_status:${messageId}`, "status");
      callback(status);
    });
    socket.on("getUnreadCount", async ({ groupId, userId }, callback) => {
      try {
        // 🛡️ Validate inputs
        if (!groupId || !userId) {
          console.warn("Invalid getUnreadCount data:", { groupId, userId });
          return callback(0); // Return 0 unread count if input is invalid
        }
        let count = await redis.hget("unread_counts", `${groupId}:${userId}`);
        count = count ? parseInt(count) : 0;
        console.log("count", count)
        callback(count);
      } catch (err) {
        console.error("Error fetching unread count:", err);
        callback(0);
      }
    });

    // prashant code end

    // Retrieve message history for a group
    socket.on("getMessages", async ({ groupId, page, pageSize, userId }, callback) => {
      try {
        if (!groupId || !page || !pageSize || page <= 0 || pageSize <= 0) {
          console.warn("Invalid or missing parameters in getMessages", { groupId, page, pageSize });
          if (typeof callback === "function") {
            return callback([]);
          } else {
            return;
          }
        }
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize - 1;

        // Fetch total messages in Redis
        const totalRedisMessages = await redis.llen(`messages:${groupId}`);
        // Adjust indexes to avoid negative values or invalid ranges
        const redisStart = Math.max(totalRedisMessages - endIndex - 1, 0);
        const redisEnd = totalRedisMessages - startIndex - 1;

        let redisMessages = [];
        if (redisStart <= redisEnd) {
          redisMessages = await redis.lrange(`messages:${groupId}`, redisStart, redisEnd);

        }

        // Ensure messages are parsed correctly
        const recentMessages = redisMessages
          .map((msg) => {
            try {
              return JSON.parse(msg);
            } catch (e) {
              console.error("Failed to parse Redis message:", msg);
              return null; // Skip invalid messages
            }
          })
          .filter((msg) => msg && msg._id); // Remove null/undefined and missing _id
        let remainingCount = pageSize - recentMessages.length;
        let modifiedMessages = [];
        const redisMessageIds = new Set(recentMessages.map((msg) => String(msg._id)));
        //Fetch older messages from MongoDB if needed

        if (remainingCount > 0) {
          //   const skipCount =
          //     startIndex - (totalRedisMessages > startIndex ? startIndex : totalRedisMessages);
          // console.log(`totalRedisMessages`, skipCount);
          const alreadyFetchedCount = totalRedisMessages > startIndex ? totalRedisMessages - startIndex : 0;
          const skipCount = ((page - 1) * pageSize) + alreadyFetchedCount;

          if (skipCount >= 0) {
            // olderMessages = await Message.find({ conversationId: groupId,_id: { $nin: Array.from(redisMessageIds) } })
            const olderMessages = await Message.find({
              conversationId: groupId,
              _id: { $nin: Array.from(redisMessageIds) },
              hiddenBy: { $nin: [userId] }
            })
              .select("_id message timestamp conversationId attachments isImportant senderID messageId status encrypted encryptedMessage priority")
              .populate({
                path: "senderID",
                select: "_id fullName profilePicture role status",
              })
              // olderMessages = await Message.find({ conversationId: groupId },_id: { $nin: Array.from(redisMessageIds) })
              .sort({ timestamp: -1 })
              .skip(skipCount)
              .limit(remainingCount)
              .lean();

            modifiedMessages = olderMessages.map(msg => ({
              _id: msg._id,
              message: msg.message,
              timestamp: msg.timestamp,
              groupId: msg.conversationId,
              attachments: msg.attachments,
              isImportant: msg.isImportant,
              senderID: msg?.senderID?._id,
              senderDetails: msg.senderID,
              messageId: msg?.messageId,
              status: msg?.status,
              priority: msg?.priority,
              encrypted: msg?.encrypted,
              encryptedMessage: msg?.encryptedMessage,
            }));
          }
        }

        // **Ensure all messages have `_id` before adding them to the Map**
        const uniqueMessagesMap = new Map();

        [...modifiedMessages, ...recentMessages].forEach((msg) => {
          // console.log(msg,"1414414141414141")
          if (msg && msg._id) {
            uniqueMessagesMap.set(String(msg._id), msg); // Ensure `_id` is a string

          } else {
            console.warn("Skipping message without _id:", msg);
          }
        });
        // console.log("uniqueMessagesMap",uniqueMessagesMap)

        // Convert back to array and sort by timestamp ascending
        const allMessages = Array.from(uniqueMessagesMap.values()).sort((a, b) => a.timestamp - b.timestamp);

        // Decrypt encrypted messages before returning to client
        const decryptedMessages = allMessages.map(msg => {
          if (msg.encrypted && msg.encryptedMessage) {
            try {
              return { ...msg, message: safeDecryptPHI(msg.encryptedMessage), encryptedMessage: undefined };
            } catch (e) {
              return { ...msg, message: "[decryption failed]" };
            }
          }
          return msg;
        });

        callback(decryptedMessages);

      } catch (err) {
        console.error("Error in getMessages:", err);
        if (typeof callback === "function") {
          callback([]);
        } else {
          console.warn("Callback is not a function:", callback);
        }
      }
    })


    socket.on("mute-audio", async({ groupId, senderID, isAudioMuted, uid }) => {
      // 🛡️ Validate inputs
      if (!groupId || !senderID || typeof isAudioMuted === 'undefined' || !uid) {
        console.warn("Invalid mute-audio data:", { groupId, senderID, isAudioMuted, uid });
        return; // Prevent further execution if any required data is missing
      }
      console.log(groupId, "ddddd", senderID);
      var audioinfo = await redis.get(
        `audioInfo:${groupId}`
      );
      if (audioinfo != null) {  
      var audio = JSON.parse(audioinfo ).audio
      const user = audio.indexOf(u => u.uid === uid);
      console.log(user,"=========user",audio);
      
      if (user == -1) {
          audio.push({
            uid: uid,
            audiomute: isAudioMuted
          })
        }else{
          audio[user].audiomute = isAudioMuted
        }
      await redis.set(
          `audioInfo:${groupId}`,
          JSON.stringify({
            status: "active",
            audio: audio,
          })
        );
      }else{
      var audioinfo = {
        uid: uid,
        audiomute: isAudioMuted
      }
      await redis.set(
          `audioInfo:${groupId}`,
          JSON.stringify({
            status: "active",
            audio: [audioinfo],
          })
        );
      }
      socket.to(groupId).emit("mute-audio-on", { groupId, senderID, isAudioMuted, uid });
    });


    socket.on("getmutedinfo", async ({ groupId }, callback) => {
      try {
        if (!groupId) {
          console.warn("Invalid or missing parameters in getMessages", { groupId });
          if (typeof callback === "function") {
            return callback([]);
          } else {
            return;
            console.warn("Callback is not a function:", callback);
          }
        }
        var audioinfo = await redis.get(
          `audioInfo:${groupId}`
        );
        console.log(audioinfo, "callstatuscallstatus");
        callback(audioinfo)
      }
      catch (err) {
        console.error("Error in getMessages:", err);
        if (typeof callback === "function") {
          callback([]);
        } else {
          console.warn("Callback is not a function:", callback);
        }
      }


    })


    socket.on("mute-video", ({ groupId, senderID, isVideoMuted, uid, name }) => {
      // 🛡 Validate inputs
      if (!groupId || !senderID || typeof isVideoMuted === 'undefined' || !uid) {
        console.warn("Invalid mute-video data:", { groupId, senderID, isVideoMuted, uid });
        return; // Prevent further execution if any required data is missing
      }
      console.log(groupId, "ddddd", senderID);

      socket.to(groupId).emit("mute-video-on", { groupId, senderID, isVideoMuted, uid, name });
    });

    // Handle user disconnect
    socket.on("disconnect", async () => {
      const disconnectedSocketId = socket.id;
      console.log(`Socket disconnected: ${disconnectedSocketId}`);

      for (const [userId, socketId] of users.entries()) {
        if (socketId === disconnectedSocketId) {
          users.delete(userId);

          // Remove the socket from user's socket set
          await redis.srem(`sockets:${userId}`, disconnectedSocketId);

          // Check if any sockets remain for this user
          const remainingSockets = await redis.scard(`sockets:${userId}`);

          if (remainingSockets === 0) {
            await redis.del(`sockets:${userId}`); // Clean up
            await redis.hdel("user_sockets", userId);
            await redis.srem("online_users", userId);
            io.emit("userOffline", userId);
            console.log(`User ${userId} is now offline`);
          }

          break; // Found the matching user, no need to continue loop
        }
      }
    });

    // Handle user disconnect
    socket.on("disconnection", async () => {
      if (users.size === 0) {
        console.log("No users currently connected.");
        return; // Exit early if no users are connected
      }
      for (const [userId, socketId] of users.entries()) {
        console.log(socketId, "ssssss");

        if (socketId === socket.id) {
          users.delete(userId);
          await redis.hdel("user_sockets", userId);
          await redis.srem("online_users", userId); // ✅ Remove from online users set

          // Notify all users that this user is offline
          io.emit("userOffline", userId);
          break;
        }
      }
    });
    socket.on("typing", ({ groupId, senderID }) => {
      // 🛡️ Validate inputs
      if (!groupId || !senderID) {
        console.warn("Invalid typing event data:", { groupId, senderID });
        return; // Prevent further execution if groupId or senderID is missing
      }

      console.log(groupId, "ddddd", senderID);

      socket.to(groupId).emit("userTyping", { groupId, senderID });
    });

    // When user stops typing
    socket.on("stopTyping", ({ groupId, senderID }) => {
      if (!groupId || !senderID) {
        console.warn("Invalid stopTyping event data:", { groupId, senderID });
        return; // Prevent further execution if groupId or senderID is missing
      }
      console.log("pppppppppp");

      socket.to(groupId).emit("userStopTyping", { groupId, senderID });
    });

    socket.on("deleteMessage", async ({ groupId, messageId, userIds }) => {
      if (!groupId || !userIds || !messageId) {
        console.warn("Invalid deleteMessage event data:", { groupId, userIds, messageId });
        return;
      }

      try {
        const messageDetails = await Message.findOne({ messageId: messageId });

        if (!messageDetails) {
          console.warn("Message not found with ID:", messageId);
          return;
        }

        // Update hiddenBy field
        messageDetails.hiddenBy = userIds;
        await messageDetails.save();

        // Delete from Redis
        const redisMessages = await redis.lrange(`messages:${groupId}`, 0, -1);

        for (let msg of redisMessages) {
          const parsedMsg = JSON.parse(msg);
          if (parsedMsg.messageId === messageId) {
            await redis.lrem(`messages:${groupId}`, 1, msg); // Remove first occurrence
            break;
          }
        }

        // Emit updated message to sender only
        // socket.emit("messageDeleted", messageDetails);

        // Optionally broadcast to group
        io.to(groupId).emit("messageDeleted", messageDetails);
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    });

    socket.on("editMessage", async ({ groupId, messageId, message }) => {
      if (!groupId || !message || !messageId) {
        console.warn("Invalid deleteMessage event data:", { groupId, message, messageId });
        return;
      }
      try {
        const messageDetails = await Message.findOne({ messageId: messageId });
        if (!messageDetails) {
          console.warn("Message not found with ID:", messageId);
          return;
        }
        console.log("message", message)
        // Update hiddenBy field
        messageDetails.message = message;
        await messageDetails.save()
        console.log(`messageDetails`, messageDetails);
        // Optionally broadcast to group
        // Update in Redis
        // 2. Fetch all messages in Redis list
        const messages = await redis.lrange(`messages:${groupId}`, 0, -1);
        console.log(`messageDetails1234`, messages);

        // 3. Find index of the message to update
        let messageIndex = -1;
        for (let i = 0; i < messages.length; i++) {
          const msg = JSON.parse(messages[i]);
          if (msg.messageId === messageId) {
            messageIndex = i;
            break;
          }
        }

        if (messageIndex === -1) {
          console.warn(`Message with ID ${messageId} not found in Redis for group ${groupId}`);
        } else {
          // 4. Update the message content
          const updatedMessage = {
            ...JSON.parse(messages[messageIndex]),
            message: message,
          };

          // 5. Set updated message back to Redis list
          await redis.lset(`messages:${groupId}`, messageIndex, JSON.stringify(updatedMessage));
        }
        io.to(groupId).emit("editMessage", messageDetails);
        await Conversation.findOneAndUpdate(
          { _id: groupId }, // Find the conversation by groupId
          {
            latestMessage: message, // Set the latest message text
          },
          { new: true } // Return the updated document
        );
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    });
    socket.on("getcallstart", async ({ groupId }, callback) => {
      try {
        if (!groupId) {
          console.warn("Invalid or missing parameters in getMessages", { groupId });
          if (typeof callback === "function") {
            return callback([]);
          } else {
            return;
            console.warn("Callback is not a function:", callback);
          }
        }
        var callstatus = await redis.get(
          `call:${groupId}`
        );
        console.log(callstatus, "callstatuscallstatus");
        callback(callstatus)
      }
      catch (err) {
        console.error("Error in getMessages:", err);
        if (typeof callback === "function") {
          callback([]);
        } else {
          console.warn("Callback is not a function:", callback);
        }
      }
    })

    socket.on("getcallingparticipantinfo", async ({ participantId }, callback) => {
      try {
        if (!participantId) {
          console.warn("Invalid or missing parameters in getcallingparticipantinfo", { participantId });
          if (typeof callback === "function") {
            return callback(false);
          } else {
            return;
          }
        }

        // 🔍 Safety net: if there is no active call in the system at all,
        // clear any stale callingparticipantinfo so users are not shown as busy.
        try {
          const activeCallKeys = await redis.keys('call:*');
          if (!activeCallKeys || activeCallKeys.length === 0) {
            await redis.del('callingparticipantinfo');
            if (typeof callback === 'function') {
              return callback(false);
            }
            return;
          }
        } catch (scanErr) {
          console.warn('Error checking active call keys in getcallingparticipantinfo:', scanErr);
        }

        var callparticipant = await redis.get(
          `callingparticipantinfo`
        );
        console.log(callparticipant, "getcallingparticipantinfo==============");
        
        // Parse the callparticipant data
        let participants = [];
        if (callparticipant) {
          try {
            const parsedData = JSON.parse(callparticipant);
            participants = parsedData.participant || [];
          } catch (e) {
            console.error("Error parsing callparticipant:", e);
            participants = [];
          }
        }
        
        // Check if participantId exists in the participants array
        const isParticipant = participants.includes(participantId);
        callback(isParticipant);
      }
      catch (err) {
        console.error("Error in getcallingparticipantinfo:", err);
        if (typeof callback === "function") {
          callback(false);
        } else {
          console.warn("Callback is not a function:", callback);
        }
      }
    })



    socket.on("getparticipantinfo", async ({ groupId }, callback) => {
      try {
        if (!groupId) {
          console.warn("Invalid or missing parameters in getMessages", { groupId });
          if (typeof callback === "function") {
            return callback([]);
          } else {
            return;
            console.warn("Callback is not a function:", callback);
          }
        }
        var participantinfo = await redis.get(
          `participantinfo:${groupId}`
        );
        console.log(participantinfo, "callstatuscallstatus");
        callback(participantinfo)
      }
      catch (err) {
        console.error("Error in getMessages:", err);
        if (typeof callback === "function") {
          callback([]);
        } else {
          console.warn("Callback is not a function:", callback);
        }
      }


    })
    socket.on("getcallstarttime", async ({ groupId }, callback) => {
      try {
        if (!groupId) {
          console.warn("Invalid or missing parameters in getMessages", { groupId });
          if (typeof callback === "function") {
            return callback([]);
          } else {
            return;
            console.warn("Callback is not a function:", callback);
          }
        }
        var callstatus = await redis.get(
          `callduration:${groupId}`
        );
        console.log(callstatus, "callstatuscallstatus");
        callback(callstatus)
      }
      catch (err) {
        console.error("Error in getMessages:", err);
        if (typeof callback === "function") {
          callback([]);
        } else {
          console.warn("Callback is not a function:", callback);
        }
      }


    })

    // edite group
    socket.on("editGroup", async (event) => {
      try {
        const { groupId } = event;
        if (!groupId) {
          console.error("No groupId provided in editGroup event");
          return;
        }

        const messageDetails = await Conversation.findOne({ _id: groupId });

        if (!messageDetails) {
          console.error(`No conversation found for groupId: ${groupId}`);
          return;
        }

        // Ensure messageDetails is an array or convert accordingly
        const userIds = Array.isArray(messageDetails.userlist)
          ? (messageDetails.userlist).map((item) => item.userid)
          : [];

        if (!userIds.length) {
          console.warn(`No userIds found for groupId: ${groupId}`);
        }

        // Clear existing members in Redis
        await redis.del(`group:${groupId}`);

        // Add new members to Redis if userIds are present
        if (userIds.length) {
          await redis.sadd(`group:${groupId}`, ...userIds);
        }

        // Emit group update
        io.to(groupId).emit("groupUpdated", { groupId });
      } catch (error) {
        console.error(`Error handling editGroup event for groupId: ${event?.groupId}`, error);
        socket.emit("error", { message: "Internal server error in editGroup", error: error.message });
      }
    });

    socket.on("delete-conversation", async ({ conversationId, userId }, callback) => {
      try {
        // 1️⃣ Ensure the conversation exists
        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          const msg = `Conversation not found with ID: ${conversationId}`;
          console.warn(msg);
          if (callback) callback({ success: false, message: msg });
          return;
        }

        // 2️⃣ Update conversation: hide it for this user
        const convResult = await Conversation.findOneAndUpdate(
          { _id: conversationId },
          { $addToSet: { hiddenFor: userId } },
          { new: true } // return updated document
        );

        // 3️⃣ Bulk update all messages in that conversation
        const msgResult = await Message.updateMany(
          { conversationId },
          { $addToSet: { hiddenBy: userId } }
        );
        await redis.del(`messages:${conversationId}`);

        // 🔄 Send success response
        if (callback) {
          callback({
            success: true,
            message: "Conversation and associated messages deleted successfully",
            convResult,
            msgResult
          });
        }
      } catch (error) {
        console.error("Delete conversation error:", error);
        if (callback) {
          callback({
            success: false,
            message: "Failed to delete conversation/messages",
            error: error.message
          });
        }
      }
    });

    // ─── Acknowledge CRITICAL message ──────────────────────────────────────
    socket.on("acknowledgeMessage", async ({ messageId, userId }, callback) => {
      try {
        if (!messageId || !userId) {
          if (callback) callback({ success: false, message: "Missing parameters" });
          return;
        }
        const msg = await Message.findById(messageId);
        if (!msg) {
          if (callback) callback({ success: false, message: "Message not found" });
          return;
        }
        if (msg.acknowledgedAt) {
          if (callback) callback({ success: true, message: "Already acknowledged" });
          return;
        }
        msg.acknowledgedAt = new Date();
        msg.acknowledgedBy = userId;
        await msg.save();

        // Broadcast acknowledgement to the conversation
        io.to(msg.conversationId?.toString()).emit("messageAcknowledged", {
          messageId: msg._id,
          acknowledgedBy: userId,
          acknowledgedAt: msg.acknowledgedAt,
        });

        if (callback) callback({ success: true });
      } catch (error) {
        console.error("Acknowledge error:", error.message);
        if (callback) callback({ success: false, message: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 5A — Slack-Inspired Collaboration Features
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 5A.1 Channel Topics ──────────────────────────────────────────────
    socket.on("setTopic", async ({ groupId, topic, userId, userName }, callback) => {
      try {
        if (!groupId || topic == null) {
          if (callback) callback({ success: false, message: "Missing parameters" });
          return;
        }
        const topicText = (topic || '').slice(0, 200); // max 200 chars
        const conversation = await Conversation.findByIdAndUpdate(
          groupId,
          { topic: { text: topicText, setBy: userId, setAt: new Date() } },
          { new: true }
        );
        if (!conversation) {
          if (callback) callback({ success: false, message: "Conversation not found" });
          return;
        }

        // Broadcast topic change to all group members
        io.to(groupId).emit("topicUpdated", {
          groupId,
          topic: conversation.topic,
        });

        // Create a system message for the topic change
        const systemMsg = new Message({
          senderID: userId,
          message: `${userName || 'Someone'} set the topic: ${topicText}`,
          conversationId: groupId,
          timestamp: Date.now(),
          messageId: new mongoose.Types.ObjectId().toString(),
          status: "SENT",
          priority: "ROUTINE",
        });
        await systemMsg.save();
        io.to(groupId).emit("newMessage", {
          groupId,
          messageId: systemMsg.messageId,
          senderID: userId,
          message: systemMsg.message,
          timestamp: systemMsg.timestamp,
          attachments: [],
          isImportant: false,
          priority: "ROUTINE",
          isSystem: true,
        });

        if (callback) callback({ success: true, topic: conversation.topic });
      } catch (error) {
        console.error("setTopic error:", error.message);
        if (callback) callback({ success: false, message: error.message });
      }
    });

    // ─── 5A.2 Message Reactions ───────────────────────────────────────────
    socket.on("addReaction", async ({ groupId, messageId, emoji, userId, userName }, callback) => {
      try {
        if (!groupId || !messageId || !emoji || !userId) {
          if (callback) callback({ success: false, message: "Missing parameters" });
          return;
        }

        // Curated healthcare emoji set
        const allowedEmojis = ['thumbsup', 'check', 'eyes', 'heart', 'exclamation', 'question'];
        if (!allowedEmojis.includes(emoji)) {
          if (callback) callback({ success: false, message: "Emoji not allowed" });
          return;
        }

        // Remove existing reaction by this user with same emoji, then add new one
        await Message.updateOne(
          { messageId },
          { $pull: { reactions: { userId, emoji } } }
        );
        const msg = await Message.findOneAndUpdate(
          { messageId },
          { $push: { reactions: { emoji, userId, userName, createdAt: new Date() } } },
          { new: true }
        );

        if (!msg) {
          if (callback) callback({ success: false, message: "Message not found" });
          return;
        }

        // If CRITICAL message and reaction by non-sender → auto-acknowledge
        if (msg.priority === 'CRITICAL' && msg.senderID?.toString() !== userId && !msg.acknowledgedAt) {
          msg.acknowledgedAt = new Date();
          msg.acknowledgedBy = userId;
          await msg.save();
          io.to(groupId).emit("messageAcknowledged", {
            messageId: msg._id,
            acknowledgedBy: userId,
            acknowledgedAt: msg.acknowledgedAt,
          });
        }

        // Update Redis cache
        const messages = await redis.lrange(`messages:${groupId}`, 0, -1);
        for (let i = 0; i < messages.length; i++) {
          const cached = JSON.parse(messages[i]);
          if (cached.messageId === messageId) {
            cached.reactions = msg.reactions;
            await redis.lset(`messages:${groupId}`, i, JSON.stringify(cached));
            break;
          }
        }

        // Broadcast to group
        io.to(groupId).emit("reactionUpdated", {
          groupId,
          messageId,
          reactions: msg.reactions,
        });

        if (callback) callback({ success: true, reactions: msg.reactions });
      } catch (error) {
        console.error("addReaction error:", error.message);
        if (callback) callback({ success: false, message: error.message });
      }
    });

    socket.on("removeReaction", async ({ groupId, messageId, emoji, userId }, callback) => {
      try {
        if (!groupId || !messageId || !emoji || !userId) {
          if (callback) callback({ success: false, message: "Missing parameters" });
          return;
        }

        const msg = await Message.findOneAndUpdate(
          { messageId },
          { $pull: { reactions: { userId, emoji } } },
          { new: true }
        );

        if (!msg) {
          if (callback) callback({ success: false, message: "Message not found" });
          return;
        }

        // Update Redis cache
        const messages = await redis.lrange(`messages:${groupId}`, 0, -1);
        for (let i = 0; i < messages.length; i++) {
          const cached = JSON.parse(messages[i]);
          if (cached.messageId === messageId) {
            cached.reactions = msg.reactions;
            await redis.lset(`messages:${groupId}`, i, JSON.stringify(cached));
            break;
          }
        }

        io.to(groupId).emit("reactionUpdated", {
          groupId,
          messageId,
          reactions: msg.reactions,
        });

        if (callback) callback({ success: true, reactions: msg.reactions });
      } catch (error) {
        console.error("removeReaction error:", error.message);
        if (callback) callback({ success: false, message: error.message });
      }
    });

    // ─── 5A.3 Message Pinning ─────────────────────────────────────────────
    socket.on("pinMessage", async ({ groupId, messageId, userId, userName }, callback) => {
      try {
        if (!groupId || !messageId || !userId) {
          if (callback) callback({ success: false, message: "Missing parameters" });
          return;
        }

        const conversation = await Conversation.findById(groupId);
        if (!conversation) {
          if (callback) callback({ success: false, message: "Conversation not found" });
          return;
        }

        // Enforce max 10 pins
        if (conversation.pinnedMessages && conversation.pinnedMessages.length >= 10) {
          if (callback) callback({ success: false, message: "Maximum 10 pinned messages reached" });
          return;
        }

        // Check if already pinned
        const alreadyPinned = conversation.pinnedMessages?.some(
          (p) => p.messageId?.toString() === messageId
        );
        if (alreadyPinned) {
          if (callback) callback({ success: false, message: "Message already pinned" });
          return;
        }

        // Find the actual message to get its MongoDB _id
        const msg = await Message.findOne({ messageId });
        if (!msg) {
          if (callback) callback({ success: false, message: "Message not found" });
          return;
        }

        conversation.pinnedMessages = conversation.pinnedMessages || [];
        conversation.pinnedMessages.push({
          messageId: msg._id,
          pinnedBy: userId,
          pinnedAt: new Date(),
        });
        await conversation.save();

        io.to(groupId).emit("messagePinned", {
          groupId,
          messageId,
          mongoId: msg._id,
          pinnedBy: userId,
          pinnedByName: userName,
          pinnedAt: new Date(),
          messagePreview: msg.message?.slice(0, 100) || '[Attachment]',
        });

        if (callback) callback({ success: true });
      } catch (error) {
        console.error("pinMessage error:", error.message);
        if (callback) callback({ success: false, message: error.message });
      }
    });

    socket.on("unpinMessage", async ({ groupId, messageId, userId }, callback) => {
      try {
        if (!groupId || !messageId) {
          if (callback) callback({ success: false, message: "Missing parameters" });
          return;
        }

        // messageId here could be the mongo _id of the message
        await Conversation.findByIdAndUpdate(
          groupId,
          { $pull: { pinnedMessages: { messageId: messageId } } }
        );

        // Also try by the string messageId field
        const msg = await Message.findOne({ messageId });
        if (msg) {
          await Conversation.findByIdAndUpdate(
            groupId,
            { $pull: { pinnedMessages: { messageId: msg._id } } }
          );
        }

        io.to(groupId).emit("messageUnpinned", { groupId, messageId });

        if (callback) callback({ success: true });
      } catch (error) {
        console.error("unpinMessage error:", error.message);
        if (callback) callback({ success: false, message: error.message });
      }
    });

  });

};