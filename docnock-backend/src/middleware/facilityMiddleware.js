import Facility from "../models/Facility";
import FacilityMembership from "../models/FacilityMembership";
import mongoose from "mongoose";

/**
 * Core facility context resolver.
 * Extracts facilityId from JWT claim or X-Facility-Id header,
 * validates the facility exists and user has access,
 * then sets req.facility and req.facilityId.
 */
async function resolveFacilityContext(req) {
  // Priority: JWT claim > header
  const facilityId = req.user?.facilityId || req.headers["x-facility-id"];

  if (!facilityId) return null;

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(facilityId)) {
    return { error: 400, message: "Invalid facility ID format" };
  }

  // Check facility exists and is active
  const facility = await Facility.findOne({
    _id: facilityId,
    isDeleted: false,
    status: "active",
  })
    .select("_id name slug type")
    .lean();

  if (!facility) {
    return { error: 404, message: "Facility not found or inactive" };
  }

  // Superadmin can access any facility
  const userRole = req.user?.role || req.user?.userType;
  if (userRole === "superadmin") {
    return { facility };
  }

  // Check membership
  const userId = req.user?.userId || req.user?._id;
  const membership = await FacilityMembership.findOne({
    userId,
    facilityId,
    status: "active",
  })
    .select("role permissions")
    .lean();

  if (!membership) {
    return { error: 403, message: "You do not have access to this facility" };
  }

  return { facility, membership };
}

/**
 * Strict middleware — requires facility context.
 * Returns 400 if no facility ID provided, 403 if no access.
 */
export const requireFacility = async (req, res, next) => {
  try {
    const result = await resolveFacilityContext(req);

    if (!result) {
      return res.status(400).json({ success: false, message: "Facility context required (X-Facility-Id header or JWT claim)" });
    }

    if (result.error) {
      return res.status(result.error).json({ success: false, message: result.message });
    }

    req.facility = result.facility;
    req.facilityId = result.facility._id;
    if (result.membership) {
      req.facilityRole = result.membership.role;
      req.facilityPermissions = result.membership.permissions;
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: "Facility middleware error" });
  }
};

/**
 * Lenient middleware — attaches facility context if present, passes through if not.
 * Use this for routes that work both with and without facility scope.
 */
export const optionalFacility = async (req, res, next) => {
  try {
    const result = await resolveFacilityContext(req);

    if (result && !result.error) {
      req.facility = result.facility;
      req.facilityId = result.facility._id;
      if (result.membership) {
        req.facilityRole = result.membership.role;
        req.facilityPermissions = result.membership.permissions;
      }
    }
    // If no context or error, just continue without facility scope

    next();
  } catch (err) {
    // Don't block on middleware errors — just continue
    next();
  }
};
