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
import { optionalFacility } from "../middleware/facilityMiddleware";

export default (router) => {
  // ─── On-Call Schedule ──────────────────────────────────────────────────────
  router.post("/schedule/create", optionalFacility, createSchedule);
  router.put("/schedule/:id", optionalFacility, updateSchedule);
  router.delete("/schedule/:id", deleteSchedule);
  router.get("/schedule/facility/:id", optionalFacility, getFacilitySchedule);
  router.get("/schedule/oncall-now", optionalFacility, getOnCallNow);

  // ─── Escalation Chains ─────────────────────────────────────────────────────
  router.post("/escalation/create", optionalFacility, createEscalationChain);
  router.get("/escalation/facility/:id", optionalFacility, getFacilityEscalationChains);
  router.post("/escalation/trigger", optionalFacility, triggerEscalation);

  return router;
};
