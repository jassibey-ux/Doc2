import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getFacilitySchedule,
  getOnCallNow,
  createEscalationChain,
  getFacilityEscalationChains,
  triggerEscalation,
} from "./Controller";

export default (router) => {
  // ─── On-Call Schedule ──────────────────────────────────────────────────────
  router.post("/schedule/create", createSchedule);
  router.put("/schedule/:id", updateSchedule);
  router.delete("/schedule/:id", deleteSchedule);
  router.get("/schedule/facility/:id", getFacilitySchedule);
  router.get("/schedule/oncall-now", getOnCallNow);

  // ─── Escalation Chains ─────────────────────────────────────────────────────
  router.post("/escalation/create", createEscalationChain);
  router.get("/escalation/facility/:id", getFacilityEscalationChains);
  router.post("/escalation/trigger", triggerEscalation);

  return router;
};
