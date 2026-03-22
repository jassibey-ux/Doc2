import {
  createHandoff,
  getHandoffs,
  getHandoffById,
  updateHandoff,
  acknowledgeHandoff,
  completeHandoff,
  createSbar,
  getSbars,
  getSbarById,
  acknowledgeSbar,
  resolveSbar,
  createAlert,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  escalateAlert,
  createConsultation,
  getConsultations,
  acceptConsultation,
  completeConsultation,
  declineConsultation,
} from "./Controller";
import { optionalFacility } from "../middleware/facilityMiddleware";

export default (router) => {
  // ─── Shift Handoffs ───────────────────────────────────────────────────────
  router.post("/clinical/handoffs", optionalFacility, createHandoff);
  router.get("/clinical/handoffs", optionalFacility, getHandoffs);
  router.get("/clinical/handoffs/:id", getHandoffById);
  router.put("/clinical/handoffs/:id", updateHandoff);
  router.post("/clinical/handoffs/:id/acknowledge", acknowledgeHandoff);
  router.post("/clinical/handoffs/:id/complete", completeHandoff);

  // ─── SBAR Reports ────────────────────────────────────────────────────────
  router.post("/clinical/sbar", optionalFacility, createSbar);
  router.get("/clinical/sbar", optionalFacility, getSbars);
  router.get("/clinical/sbar/:id", getSbarById);
  router.post("/clinical/sbar/:id/acknowledge", acknowledgeSbar);
  router.post("/clinical/sbar/:id/resolve", resolveSbar);

  // ─── Clinical Alerts ──────────────────────────────────────────────────────
  router.post("/clinical/alerts", optionalFacility, createAlert);
  router.get("/clinical/alerts", optionalFacility, getAlerts);
  router.post("/clinical/alerts/:id/acknowledge", acknowledgeAlert);
  router.post("/clinical/alerts/:id/resolve", resolveAlert);
  router.post("/clinical/alerts/:id/escalate", escalateAlert);

  // ─── Consultation Requests ────────────────────────────────────────────────
  router.post("/clinical/consultations", optionalFacility, createConsultation);
  router.get("/clinical/consultations", optionalFacility, getConsultations);
  router.post("/clinical/consultations/:id/accept", acceptConsultation);
  router.post("/clinical/consultations/:id/complete", completeConsultation);
  router.post("/clinical/consultations/:id/decline", declineConsultation);

  return router;
};
