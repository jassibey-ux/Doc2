import OnCallSchedule from "../models/OnCallSchedule";
import EscalationChain from "../models/EscalationChain";
import { Success, Error } from "../utils/customeResponse";

// ─── On-Call Schedule ────────────────────────────────────────────────────────

export const createSchedule = async (req, res) => {
  try {
    const { facilityId, role, userId, startTime, endTime, timezone, isBackup, notes } = req.body;

    if (!facilityId || !role || !userId || !startTime || !endTime || !timezone) {
      return Error(res, 400, "facilityId, role, userId, startTime, endTime, and timezone are required");
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
      return Error(res, 400, "startTime must be before endTime");
    }

    const schedule = await OnCallSchedule.create({
      facilityId,
      role,
      userId,
      startTime: start,
      endTime: end,
      timezone,
      isBackup: isBackup ?? false,
      notes,
      createdBy: req.user?._id,
    });

    return Success(res, 201, "On-call schedule created", schedule);
  } catch (err) {
    return Error(res, 500, "Failed to create schedule", err.message);
  }
};

export const updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.startTime && updates.endTime) {
      if (new Date(updates.startTime) >= new Date(updates.endTime)) {
        return Error(res, 400, "startTime must be before endTime");
      }
    }

    const schedule = await OnCallSchedule.findByIdAndUpdate(id, updates, { new: true });
    if (!schedule) return Error(res, 404, "Schedule not found");

    return Success(res, 200, "Schedule updated", schedule);
  } catch (err) {
    return Error(res, 500, "Failed to update schedule", err.message);
  }
};

export const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await OnCallSchedule.findByIdAndDelete(id);
    if (!schedule) return Error(res, 404, "Schedule not found");
    return Success(res, 200, "Schedule deleted");
  } catch (err) {
    return Error(res, 500, "Failed to delete schedule", err.message);
  }
};

export const getFacilitySchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    const filter = { facilityId: id };
    if (from || to) {
      filter.startTime = {};
      if (from) filter.startTime.$gte = new Date(from);
      if (to) filter.endTime = { $lte: new Date(to) };
    }

    const schedules = await OnCallSchedule.find(filter)
      .populate("userId", "fullName profileImage role")
      .populate("createdBy", "fullName")
      .sort({ startTime: 1 });

    return Success(res, 200, "Schedule fetched", schedules);
  } catch (err) {
    return Error(res, 500, "Failed to fetch schedule", err.message);
  }
};

/**
 * Returns who is on-call right now for a given facility and optional role.
 * Used by smart message routing in Socket.js.
 */
export const getOnCallNow = async (req, res) => {
  try {
    const { facilityId, role } = req.query;
    if (!facilityId) return Error(res, 400, "facilityId is required");

    const result = await findOnCallNow(facilityId, role);

    if (!result) {
      return Success(res, 200, "No on-call coverage at this time", null);
    }
    return Success(res, 200, "On-call user found", result);
  } catch (err) {
    return Error(res, 500, "Failed to query on-call schedule", err.message);
  }
};

/**
 * Internal helper — also exported for use by Socket.js smart routing.
 * Returns the populated on-call schedule entry (or null if no coverage).
 */
export const findOnCallNow = async (facilityId, role) => {
  const now = new Date();
  const filter = {
    facilityId,
    startTime: { $lte: now },
    endTime: { $gte: now },
    isBackup: false, // primary on-call first
  };
  if (role) filter.role = role;

  let schedule = await OnCallSchedule.findOne(filter)
    .populate("userId", "fullName profileImage role fcm_token device_token")
    .sort({ startTime: 1 });

  // Fallback to backup on-call if no primary found
  if (!schedule) {
    filter.isBackup = true;
    schedule = await OnCallSchedule.findOne(filter)
      .populate("userId", "fullName profileImage role fcm_token device_token")
      .sort({ startTime: 1 });
  }

  return schedule;
};

// ─── Escalation Chains ───────────────────────────────────────────────────────

export const createEscalationChain = async (req, res) => {
  try {
    const { facilityId, name, steps } = req.body;
    if (!facilityId || !name || !steps?.length) {
      return Error(res, 400, "facilityId, name, and at least one step are required");
    }

    // Validate steps: each must have either userId or role
    for (const step of steps) {
      if (!step.userId && !step.role) {
        return Error(res, 400, "Each escalation step must have either userId or role");
      }
    }

    const chain = await EscalationChain.create({
      facilityId,
      name,
      steps,
      createdBy: req.user?._id,
    });

    return Success(res, 201, "Escalation chain created", chain);
  } catch (err) {
    return Error(res, 500, "Failed to create escalation chain", err.message);
  }
};

export const getFacilityEscalationChains = async (req, res) => {
  try {
    const { id } = req.params;
    const chains = await EscalationChain.find({ facilityId: id, isActive: true })
      .populate("steps.userId", "fullName profileImage")
      .sort({ name: 1 });
    return Success(res, 200, "Escalation chains fetched", chains);
  } catch (err) {
    return Error(res, 500, "Failed to fetch escalation chains", err.message);
  }
};

export const triggerEscalation = async (req, res) => {
  try {
    const { chainId, conversationId } = req.body;
    if (!chainId || !conversationId) {
      return Error(res, 400, "chainId and conversationId are required");
    }

    const chain = await EscalationChain.findById(chainId).populate(
      "steps.userId",
      "fullName fcm_token device_token"
    );
    if (!chain) return Error(res, 404, "Escalation chain not found");

    // Return chain details so the caller (socket handler or cron job) can process steps
    return Success(res, 200, "Escalation triggered", { chain, conversationId });
  } catch (err) {
    return Error(res, 500, "Failed to trigger escalation", err.message);
  }
};
