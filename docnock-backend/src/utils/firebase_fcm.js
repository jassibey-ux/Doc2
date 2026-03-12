const logger = require("./logger").default;
const admin = require("firebase-admin");
const apn = require("apn");
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Gracefully init Firebase — skip if service key is missing or invalid (local dev)
let firebaseInitialized = false;
try {
  const serviceAccount = require("./firebaseServiceKey.json");
  if (!admin.apps.length && serviceAccount?.private_key && serviceAccount.private_key.length > 100) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
  }
} catch (err) {
  logger.warn("Firebase service key missing or invalid — push notifications disabled in dev mode");
}

const sendAndroidVoipCall = async (
  fcmTokens,
  callerName,
  callerId,
  audio,
  groupId,
  isGroup,
  activegrouuserids
) => {
  if (!firebaseInitialized) { logger.warn("Firebase not initialized — skipping FCM VoIP"); return; }
  logger.debug({ tokenCount: fcmTokens?.length, callerName }, "sendAndroidVoipCall");

  if (!Array.isArray(fcmTokens)) {
    throw new Error("fcmTokens must be an array of strings");
  }

  const uuid = require("uuid").v4();

  try {
    const responses = await Promise.all(
      fcmTokens.map((token) => {
        logger.debug("sending FCM VoIP message");
        return admin.messaging().send({
          token: token,
          android: {
            priority: "high",
          },
          data: {
            type: "incoming_call",
            uuid: String(uuid),
            callerName: String(callerName),
            callerId: String(callerId),
            audio: String(audio),
            groupId: String(groupId),
            isGroup: String(isGroup),
            activegrouuserids: JSON.stringify(activegrouuserids),
          },
        });
      })
    );

    // Log any failures manually
    const failedTokens = [];
    responses.forEach((res, idx) => {
      if (!res || res.error) {
        failedTokens.push(fcmTokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      logger.warn({ failedCount: failedTokens.length }, "FCM VoIP failed tokens");
    }
  } catch (error) {
    logger.error({ err: error }, "FCM sendMulticast error");
  }
};

const sendAndroidNonVoipCall = async (fcmTokens, callerName, body, groupId,userId) => {
  if (!firebaseInitialized) { logger.warn("Firebase not initialized — skipping FCM non-VoIP"); return; }
  logger.debug({ tokenCount: fcmTokens?.length, callerName }, "sendAndroidNonVoipCall");
  if (!Array.isArray(fcmTokens)) {
    throw new Error("fcmTokens must be an array of strings");
  }
  const uuid = require("uuid").v4();
  try {
    const responses = await Promise.all(
      fcmTokens.map((token) => {
        logger.debug("sending FCM non-VoIP message");
        return admin.messaging().send({
          token: token,
          android: {
            priority: "high",
               notification: {
            title: callerName,
            body: body,
          },
          },
          apns:{
            headers:{
              "apns-priority" :"10",
              "apns-collapse-id":`user_${userId}`
            },
            payload:{
              aps:{
                alert:{
                  title:callerName,
                  body:body
                },
              sound: "default",
              "thread-id":`chat_${groupId}`
            },
             },
          },
       
          data: {
            type: "incoming_message",
            uuid,
            callerName,
            groupId: groupId,
            userIds: userId
          },
        });
      })
    );

    // Log any failures manually
    const failedTokens = [];
    responses.forEach((res, idx) => {
      if (!res || res.error) {
        failedTokens.push(fcmTokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      logger.warn({ failedCount: failedTokens.length }, "FCM non-VoIP failed tokens");
    }
  } catch (error) {
    logger.error({ err: error }, "FCM non-VoIP error");
  }
};

const sendIosVoipCall = async (
  deviceTokens, // should be an array of strings
  callerName,
  callerId,
  audio,
  groupId,
  isGroup,
  activegrouuserids
) => {
  try {
    logger.debug("sendIosVoipCall start");
    
    if (!Array.isArray(deviceTokens)) {
      throw new Error("deviceTokens must be an array of strings");
    }

    const uuid = uuidv4();
    const keyPath = path.resolve(__dirname, "../utils/AuthKey_6C5KH2YZUM.p8");

    const options = {
      token: {
        key: keyPath,
        keyId: "6C5KH2YZUM",       // Replace with your Key ID
        teamId: "Y5MDH5P6RA",      // Replace with your Team ID
      },
      production: false,           // Use true in production
    };

    const apnProvider = new apn.Provider(options);

    const notification = new apn.Notification();

    // Payload
    notification.payload = {
      data: {
        type: "incoming_call",
        uuid: uuid,
        callerName: String(callerName),
        callerId: String(callerId),
        audio: String(audio),
        groupId: String(groupId),
        isGroup: String(isGroup),
        activegrouuserids: JSON.stringify(activegrouuserids),
      },
    };

    // APNs headers
    notification.aps = {
      "content-available": 1,
    };

    notification.topic = "com.docnock"; // Replace with your real bundle ID
    notification.pushType = "voip";
    notification.expiry = 0;

    // Send to all tokens
    const response = await apnProvider.send(notification, deviceTokens);

    if (response.failed.length > 0) {
      logger.error({ failedCount: response.failed.length }, "Failed to deliver to some devices");
      response.failed.forEach(failure => {
        logger.error({ device: failure.device, error: failure.error || failure.response }, "APNs delivery failure");
      });
    } else {
      logger.info("APNs message delivered successfully to all devices");
    }

    apnProvider.shutdown();
  } catch (error) {
    logger.error({ err: error }, "Error sending VoIP APNs");
  }
};

/**
 * Priority-aware message notification.
 * @param {string[]} fcmTokens
 * @param {string} callerName
 * @param {string} body
 * @param {string} groupId
 * @param {string} userId
 * @param {'ROUTINE'|'URGENT'|'CRITICAL'} priority
 */
const sendPriorityNotification = async (fcmTokens, callerName, body, groupId, userId, priority = 'ROUTINE') => {
  if (!firebaseInitialized) { logger.warn("Firebase not initialized — skipping priority notification"); return; }
  if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) return;

  const uuid = uuidv4();

  // Title prefix for non-routine priorities
  const titlePrefix = priority === 'CRITICAL' ? '[CRITICAL] '
    : priority === 'URGENT' ? '[URGENT] '
    : '';
  const title = titlePrefix + callerName;

  // Android channel mapping
  const androidChannelId = priority === 'CRITICAL' ? 'critical_alerts'
    : priority === 'URGENT' ? 'urgent_alerts'
    : 'default';

  // iOS interruption level (requires iOS 15+)
  const iosInterruptionLevel = priority === 'CRITICAL' ? 'critical'
    : priority === 'URGENT' ? 'time-sensitive'
    : 'active';

  try {
    await Promise.all(
      fcmTokens.map((token) =>
        admin.messaging().send({
          token,
          android: {
            priority: "high",
            notification: {
              title,
              body,
              channelId: androidChannelId,
              sound: priority === 'CRITICAL' ? 'critical_alert.mp3' : 'default',
            },
          },
          apns: {
            headers: {
              "apns-priority": priority === 'ROUTINE' ? "5" : "10",
              "apns-collapse-id": `user_${userId}`,
            },
            payload: {
              aps: {
                alert: { title, body },
                sound: priority === 'CRITICAL' ? 'critical_alert.caf' : 'default',
                "thread-id": `chat_${groupId}`,
                "interruption-level": iosInterruptionLevel,
              },
            },
          },
          data: {
            type: "incoming_message",
            uuid,
            callerName,
            groupId: String(groupId),
            userIds: String(userId),
            priority: String(priority),
          },
        })
      )
    );
  } catch (error) {
    logger.error({ err: error }, "FCM priority notification error");
  }
};

module.exports = {
  sendAndroidVoipCall,
  sendAndroidNonVoipCall,
  sendIosVoipCall,
  sendPriorityNotification
};
