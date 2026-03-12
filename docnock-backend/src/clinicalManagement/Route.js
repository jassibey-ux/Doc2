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

export default (router) => {
  // ─── Shift Handoffs ───────────────────────────────────────────────────────
  router.post("/clinical/handoffs", createHandoff);
  router.get("/clinical/handoffs", getHandoffs);
  router.get("/clinical/handoffs/:id", getHandoffById);
  router.put("/clinical/handoffs/:id", updateHandoff);
  router.post("/clinical/handoffs/:id/acknowledge", acknowledgeHandoff);
  router.post("/clinical/handoffs/:id/complete", completeHandoff);

  // ─── SBAR Reports ────────────────────────────────────────────────────────
  router.post("/clinical/sbar", createSbar);
  router.get("/clinical/sbar", getSbars);
  router.get("/clinical/sbar/:id", getSbarById);
  router.post("/clinical/sbar/:id/acknowledge", acknowledgeSbar);
  router.post("/clinical/sbar/:id/resolve", resolveSbar);

  // ─── Clinical Alerts ──────────────────────────────────────────────────────
  router.post("/clinical/alerts", createAlert);
  router.get("/clinical/alerts", getAlerts);
  router.post("/clinical/alerts/:id/acknowledge", acknowledgeAlert);
  router.post("/clinical/alerts/:id/resolve", resolveAlert);
  router.post("/clinical/alerts/:id/escalate", escalateAlert);

  // ─── Consultation Requests ────────────────────────────────────────────────
  router.post("/clinical/consultations", createConsultation);
  router.get("/clinical/consultations", getConsultations);
  router.post("/clinical/consultations/:id/accept", acceptConsultation);
  router.post("/clinical/consultations/:id/complete", completeConsultation);
  router.post("/clinical/consultations/:id/decline", declineConsultation);

  return router;
};
