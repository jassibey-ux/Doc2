import {
  createFacility,
  listFacilities,
  getFacilityById,
  updateFacility,
  deleteFacility,
  getFacilityStats,
  listFacilityStaff,
  inviteStaffToFacility,
  updateStaffMembership,
  removeStaffFromFacility,
  getMyFacilities,
  switchFacility,
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
} from "./Controller";
import rateLimit from "express-rate-limit";
import { requireRole, ROLES } from "../middleware/rbacMiddleware";

// Rate limiter for facility admin endpoints
const facilityRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
});

const facilityWriteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many write requests, please try again later." },
});

export default (router) => {
  const superadminOnly = requireRole(...ROLES.SUPERADMIN_ONLY);
  const adminOnly = requireRole(...ROLES.ADMIN);
  const adminOrFacility = requireRole("superadmin", "sub_admin", "facility_center");

  // ─── User-Facing (any authenticated) ──────────────────────────────────────
  router.get("/facilities/mine", facilityRateLimiter, getMyFacilities);
  router.post("/facilities/switch", facilityRateLimiter, switchFacility);
  router.get("/facilities/my-invitations", facilityRateLimiter, getMyInvitations);
  router.post("/facilities/invitations/:membershipId/accept", facilityWriteRateLimiter, acceptInvitation);
  router.post("/facilities/invitations/:membershipId/decline", facilityWriteRateLimiter, declineInvitation);

  // ─── Facility CRUD (admin only) ───────────────────────────────────────────
  router.post("/admin/facilities", facilityWriteRateLimiter, superadminOnly, createFacility);
  router.get("/admin/facilities", facilityRateLimiter, adminOrFacility, listFacilities);
  router.get("/admin/facilities/:id", facilityRateLimiter, adminOrFacility, getFacilityById);
  router.put("/admin/facilities/:id", facilityWriteRateLimiter, superadminOnly, updateFacility);
  router.delete("/admin/facilities/:id", facilityWriteRateLimiter, superadminOnly, deleteFacility);
  router.get("/admin/facilities/:id/stats", facilityRateLimiter, adminOrFacility, getFacilityStats);

  // ─── Staff Management ─────────────────────────────────────────────────────
  router.get("/admin/facilities/:id/staff", facilityRateLimiter, adminOrFacility, listFacilityStaff);
  router.post("/admin/facilities/:id/staff", facilityWriteRateLimiter, adminOrFacility, inviteStaffToFacility);
  router.put("/admin/facilities/:id/staff/:userId", facilityWriteRateLimiter, adminOrFacility, updateStaffMembership);
  router.delete("/admin/facilities/:id/staff/:userId", facilityWriteRateLimiter, adminOrFacility, removeStaffFromFacility);

  return router;
};
