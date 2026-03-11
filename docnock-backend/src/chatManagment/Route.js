import { uploadSingleProfileImage } from "../middleware/userUploads";
import { createConversation, getConversationsByUserId, generatAgoraToken, UpdateImageName, updateGroupMembers, exportChat, listNotifications, ReadNotification, uploadImage, getPinnedMessages, getMentionableUsers, getMessageReactions } from "./Controller";
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

export default (router) => {

  // ==========================
  // Private Routes (Authentication Required)
  // ==========================
  router.post("/create-group", uploadSingleProfileImage("profileImage"), createConversation);
  router.get("/group-list", getConversationsByUserId);
  router.get("/generate-agora-token", generatAgoraToken);
  router.post("/update-group-name", uploadSingleProfileImage("profileImage"), UpdateImageName);
  router.post("/update-group-members", updateGroupMembers);
  router.get('/export/:conversationId', exportChat);
  router.get('/notificationlist', listNotifications);
  router.post('/read/notification', ReadNotification)
  router.post('/upload-image', upload.array('images', 10), uploadImage);

  // ─── Phase 5A: Collaboration Features ─────────────────────────────────
  router.get('/conversations/:conversationId/pins', getPinnedMessages);
  router.get('/conversations/:conversationId/mentionable', getMentionableUsers);
  router.get('/messages/:messageId/reactions', getMessageReactions);

  return router;
};
