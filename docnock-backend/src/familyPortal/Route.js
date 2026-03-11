import {
  inviteFamily,
  verifyMagicLink,
  getFamilyPatientSummary,
  requestVideoVisit,
  listFamilyLinks,
  revokeFamilyAccess,
} from "./Controller";

export default (router) => {
  // ─── Family Portal ──────────────────────────────────────────────────────
  router.post("/family/invite", inviteFamily);
  router.get("/family/verify-link/:token", verifyMagicLink); // Public (no auth)
  router.get("/family/patient-summary", getFamilyPatientSummary);
  router.post("/family/video-request", requestVideoVisit);
  router.get("/family/links/:conversationId", listFamilyLinks);
  router.delete("/family/links/:linkId", revokeFamilyAccess);

  return router;
};
