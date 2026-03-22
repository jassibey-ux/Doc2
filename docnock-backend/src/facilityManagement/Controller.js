import Facility from "../models/Facility";
import FacilityMembership from "../models/FacilityMembership";
import ShiftHandoff from "../models/ShiftHandoff";
import ClinicalAlert from "../models/ClinicalAlert";
import OnCallSchedule from "../models/OnCallSchedule";
import User from "../models/user";
import { Success, Error } from "../utils/customeResponse";
import { encryptData } from "../utils/encryptionUtils";
import { createAuditEntry } from "../middleware/auditMiddleware";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "D0ckN0ck$ecretK3y";

// ─── Facility CRUD ─────────────────────────────────────────────────────────────

export const createFacility = async (req, res) => {
  try {
    const {
      name, address, type, licenseNumber, phone, fax, email,
      capacity, departments, status, settings,
    } = req.body;

    if (!name) {
      return Error(res, 400, "Facility name is required");
    }

    const facility = await Facility.create({
      name,
      address,
      type: type || "other",
      licenseNumber,
      phone,
      fax,
      email,
      capacity: capacity || { totalBeds: 0, icuBeds: 0 },
      departments: departments || [],
      owner: req.user?.userId || req.user?._id,
      status: status || "active",
      settings: settings || {},
    });

    // Create audit entry
    createAuditEntry({
      userId: req.user?.userId,
      userRole: req.user?.role,
      action: "FACILITY_CREATED",
      resourceType: "Facility",
      resourceId: facility._id,
      details: { name: facility.name, type: facility.type },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return Success(res, 201, "Facility created", facility);
  } catch (err) {
    if (err.code === 11000) {
      return Error(res, 409, "A facility with that name already exists");
    }
    return Error(res, 500, "Failed to create facility", err.message);
  }
};

export const listFacilities = async (req, res) => {
  try {
    const { search, status, type, owner, page = 1, limit = 50 } = req.query;

    const filter = { isDeleted: false };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (owner) filter.owner = owner;
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    // Non-superadmin: filter to facilities they have membership in
    const userRole = req.user?.role || req.user?.userType;
    if (userRole !== "superadmin") {
      const memberships = await FacilityMembership.find({
        userId: req.user?.userId || req.user?._id,
        status: "active",
      }).select("facilityId").lean();
      const facilityIds = memberships.map((m) => m.facilityId);
      filter._id = { $in: facilityIds };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [facilities, total] = await Promise.all([
      Facility.find(filter)
        .populate("owner", "fullName email role")
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Facility.countDocuments(filter),
    ]);

    const encrypted = await encryptData(JSON.stringify(facilities));
    return Success(res, 200, "Facilities fetched", {
      data: encrypted,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return Error(res, 500, "Failed to fetch facilities", err.message);
  }
};

export const getFacilityById = async (req, res) => {
  try {
    const { id } = req.params;

    const facility = await Facility.findOne({ _id: id, isDeleted: false })
      .populate("owner", "fullName email role");

    if (!facility) return Error(res, 404, "Facility not found");

    const encrypted = await encryptData(JSON.stringify(facility));
    return Success(res, 200, "Facility fetched", encrypted);
  } catch (err) {
    return Error(res, 500, "Failed to fetch facility", err.message);
  }
};

export const updateFacility = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Prevent changing critical fields via update
    delete updates._id;
    delete updates.owner;
    delete updates.legacyUserId;
    delete updates.isDeleted;

    const facility = await Facility.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!facility) return Error(res, 404, "Facility not found");

    createAuditEntry({
      userId: req.user?.userId,
      userRole: req.user?.role,
      action: "FACILITY_UPDATED",
      resourceType: "Facility",
      resourceId: facility._id,
      details: { updatedFields: Object.keys(updates) },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return Success(res, 200, "Facility updated", facility);
  } catch (err) {
    return Error(res, 500, "Failed to update facility", err.message);
  }
};

export const deleteFacility = async (req, res) => {
  try {
    const { id } = req.params;

    const facility = await Facility.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, status: "inactive" } },
      { new: true }
    );

    if (!facility) return Error(res, 404, "Facility not found");

    createAuditEntry({
      userId: req.user?.userId,
      userRole: req.user?.role,
      action: "FACILITY_DELETED",
      resourceType: "Facility",
      resourceId: facility._id,
      details: { name: facility.name },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return Success(res, 200, "Facility deleted");
  } catch (err) {
    return Error(res, 500, "Failed to delete facility", err.message);
  }
};

export const getFacilityStats = async (req, res) => {
  try {
    const { id } = req.params;

    const facility = await Facility.findOne({ _id: id, isDeleted: false }).lean();
    if (!facility) return Error(res, 404, "Facility not found");

    // Also check legacy facilityId (for backward compat where facilityId refs User._id)
    const facilityIds = [facility._id];
    if (facility.legacyUserId) facilityIds.push(facility.legacyUserId);

    const [staffCount, activeAlerts, recentHandoffs, onCallNow] = await Promise.all([
      FacilityMembership.countDocuments({ facilityId: facility._id, status: "active" }),
      ClinicalAlert.countDocuments({ facilityId: { $in: facilityIds }, status: { $in: ["active", "escalated"] } }),
      ShiftHandoff.find({ facilityId: { $in: facilityIds } })
        .sort({ shiftDate: -1 })
        .limit(5)
        .select("unit shiftType status shiftDate")
        .lean(),
      OnCallSchedule.find({
        facilityId: { $in: facilityIds },
        startTime: { $lte: new Date() },
        endTime: { $gte: new Date() },
      })
        .populate("userId", "fullName role")
        .lean(),
    ]);

    // Compute occupancy from departments
    let totalBeds = 0;
    let totalOccupied = 0;
    (facility.departments || []).forEach((dept) => {
      totalBeds += dept.beds || 0;
      totalOccupied += dept.occupied || 0;
    });
    const occupancy = totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;

    const stats = {
      staff: staffCount,
      alerts: activeAlerts,
      occupancy,
      totalBeds: facility.capacity?.totalBeds || totalBeds,
      recentHandoffs,
      onCallNow,
    };

    return Success(res, 200, "Facility stats fetched", stats);
  } catch (err) {
    return Error(res, 500, "Failed to fetch facility stats", err.message);
  }
};

// ─── Facility Staff Management ──────────────────────────────────────────────────

export const listFacilityStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { search, role, status: memberStatus, page = 1, limit = 50 } = req.query;

    const filter = { facilityId: id };
    if (memberStatus) filter.status = memberStatus;
    else filter.status = { $in: ["active", "invited"] };
    if (role) filter.role = role;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let memberships = await FacilityMembership.find(filter)
      .populate("userId", "fullName email mobile role profilePicture status")
      .populate("invitedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Apply search filter on populated user fields
    if (search) {
      const searchRegex = new RegExp(search, "i");
      memberships = memberships.filter(
        (m) => searchRegex.test(m.userId?.fullName) || searchRegex.test(m.userId?.email)
      );
    }

    const total = await FacilityMembership.countDocuments(filter);

    const encrypted = await encryptData(JSON.stringify(memberships));
    return Success(res, 200, "Facility staff fetched", {
      data: encrypted,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    return Error(res, 500, "Failed to fetch facility staff", err.message);
  }
};

export const inviteStaffToFacility = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role, isPrimary } = req.body;

    if (!userId || !role) {
      return Error(res, 400, "userId and role are required");
    }

    // Verify facility exists
    const facility = await Facility.findOne({ _id: id, isDeleted: false });
    if (!facility) return Error(res, 404, "Facility not found");

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) return Error(res, 404, "User not found");

    // Check if membership already exists
    const existing = await FacilityMembership.findOne({ userId, facilityId: id });
    if (existing) {
      if (existing.status === "suspended") {
        // Reactivate suspended membership
        existing.status = "active";
        existing.role = role;
        await existing.save();
        return Success(res, 200, "Staff membership reactivated", existing);
      }
      return Error(res, 409, "User is already a member of this facility");
    }

    const membership = await FacilityMembership.create({
      userId,
      facilityId: id,
      role,
      isPrimary: isPrimary || false,
      status: "invited",
      invitedBy: req.user?.userId || req.user?._id,
    });

    return Success(res, 201, "Staff invited to facility", membership);
  } catch (err) {
    if (err.code === 11000) {
      return Error(res, 409, "User is already a member of this facility");
    }
    return Error(res, 500, "Failed to invite staff", err.message);
  }
};

export const updateStaffMembership = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role, permissions, status, isPrimary } = req.body;

    const updates = {};
    if (role) updates.role = role;
    if (permissions) updates.permissions = permissions;
    if (status) updates.status = status;
    if (isPrimary !== undefined) updates.isPrimary = isPrimary;

    const membership = await FacilityMembership.findOneAndUpdate(
      { facilityId: id, userId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!membership) return Error(res, 404, "Membership not found");

    return Success(res, 200, "Staff membership updated", membership);
  } catch (err) {
    return Error(res, 500, "Failed to update staff membership", err.message);
  }
};

export const removeStaffFromFacility = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const membership = await FacilityMembership.findOneAndUpdate(
      { facilityId: id, userId },
      { $set: { status: "suspended" } },
      { new: true }
    );

    if (!membership) return Error(res, 404, "Membership not found");

    return Success(res, 200, "Staff removed from facility");
  } catch (err) {
    return Error(res, 500, "Failed to remove staff", err.message);
  }
};

// ─── Facility Switch & My Facilities ────────────────────────────────────────────

export const getMyFacilities = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const userRole = req.user?.role || req.user?.userType;

    let facilities;

    if (userRole === "superadmin") {
      // Superadmin sees all active facilities
      facilities = await Facility.find({ isDeleted: false, status: "active" })
        .select("name slug type status address capacity departments")
        .sort({ name: 1 })
        .lean();
    } else {
      // Other users see facilities they have active membership in
      const memberships = await FacilityMembership.find({
        userId,
        status: "active",
      })
        .populate("facilityId", "name slug type status address capacity departments")
        .sort({ isPrimary: -1, createdAt: 1 })
        .lean();

      facilities = memberships
        .filter((m) => m.facilityId && !m.facilityId.isDeleted)
        .map((m) => ({
          ...m.facilityId,
          membershipRole: m.role,
          isPrimary: m.isPrimary,
        }));
    }

    return Success(res, 200, "My facilities fetched", facilities);
  } catch (err) {
    return Error(res, 500, "Failed to fetch facilities", err.message);
  }
};

export const switchFacility = async (req, res) => {
  try {
    const { facilityId } = req.body;
    const userId = req.user?.userId || req.user?._id;
    const userRole = req.user?.role || req.user?.userType;

    if (!facilityId) {
      return Error(res, 400, "facilityId is required");
    }

    // Verify facility exists and is active
    const facility = await Facility.findOne({ _id: facilityId, isDeleted: false, status: "active" });
    if (!facility) return Error(res, 404, "Facility not found or inactive");

    // Superadmin can switch to any facility; others need membership
    if (userRole !== "superadmin") {
      const membership = await FacilityMembership.findOne({
        userId,
        facilityId,
        status: "active",
      });
      if (!membership) {
        return Error(res, 403, "You do not have access to this facility");
      }
    }

    // Issue new JWT with updated facilityId
    const tokenPayload = {
      userId,
      role: userRole,
      facilityId: facility._id,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "24h" });

    return Success(res, 200, "Facility switched", {
      token,
      facility: { _id: facility._id, name: facility.name, slug: facility.slug, type: facility.type },
    });
  } catch (err) {
    return Error(res, 500, "Failed to switch facility", err.message);
  }
};
