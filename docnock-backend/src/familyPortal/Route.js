import {
  inviteFamily,
  verifyMagicLink,
  getFamilyPatientSummary,
  requestVideoVisit,
  listFamilyLinks,
  revokeFamilyAccess,
  getFamilyFeed,
  createFeedPost,
  getFamilyChat,
  getFamilyChatMessages,
  getFamilyHealth,
  getFamilyVideoToken,
  deleteFeedPost,
  getAdminFamilyStats,
  getAdminFamilyLinks,
  updateAdminFamilyLink,
  resendFamilyInvite,
} from "./Controller";

export default (router) => {
  // ─── Family Portal ──────────────────────────────────────────────────────
  router.post("/family/invite", inviteFamily);
  router.get("/family/verify-link/:token", verifyMagicLink); // Public (no auth)
  router.get("/family/patient-summary", getFamilyPatientSummary);
  router.post("/family/video-request", requestVideoVisit);
  router.get("/family/links/:conversationId", listFamilyLinks);
  router.delete("/family/links/:linkId", revokeFamilyAccess);

  // ─── Activity Feed ────────────────────────────────────────────────────
  router.get("/family/feed", getFamilyFeed);
  router.post("/family/feed", createFeedPost); // Staff only
  router.delete("/family/feed/:postId", deleteFeedPost); // Staff only

  // ─── Family Chat ──────────────────────────────────────────────────────
  router.get("/family/chat", getFamilyChat);
  router.get("/family/chat/messages", getFamilyChatMessages);

  // ─── Family Health (PCC) ──────────────────────────────────────────────
  router.get("/family/health", getFamilyHealth);

  // ─── Family Video ─────────────────────────────────────────────────────
  router.get("/family/video/token", getFamilyVideoToken);

  // ─── Admin Family Portal Management ─────────────────────────────────
  router.get("/family/admin/stats", getAdminFamilyStats);
  router.get("/family/admin/links", getAdminFamilyLinks);
  router.put("/family/admin/links/:linkId", updateAdminFamilyLink);
  router.post("/family/admin/links/:linkId/resend", resendFamilyInvite);

  return router;
};
