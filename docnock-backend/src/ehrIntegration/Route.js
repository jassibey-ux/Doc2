import {
  linkPatient,
  unlinkPatient,
  getPatientLink,
  getPatientSummary,
  searchPccPatients,
  getPccFacilities,
} from "./Controller";

export default (router) => {
  // ─── EHR / PointClickCare Integration ────────────────────────────────────

  router.post("/pcc/link-patient", linkPatient);
  router.delete("/pcc/unlink-patient/:conversationId", unlinkPatient);
  router.get("/pcc/patient-link/:conversationId", getPatientLink);
  router.get("/pcc/patient-summary/:conversationId", getPatientSummary);
  router.get("/pcc/search-patients", searchPccPatients);
  router.get("/pcc/facilities", getPccFacilities);

  return router;
};
