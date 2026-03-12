import ShiftHandoff from "../models/ShiftHandoff";
import SbarReport from "../models/SbarReport";
import ClinicalAlert from "../models/ClinicalAlert";
import ConsultationRequest from "../models/ConsultationRequest";
import { Success, Error } from "../utils/customeResponse";
import { encryptData } from "../utils/encryptionUtils";

// ─── Shift Handoffs ───────────────────────────────────────────────────────────

export const createHandoff = async (req, res) => {
  try {
    const {
      facilityId, unit, shiftType, shiftDate, outgoingNurse, incomingNurse,
      patients, generalNotes, equipmentIssues, staffingNotes,
    } = req.body;

    if (!facilityId || !unit || !shiftType || !shiftDate || !outgoingNurse) {
      return Error(res, 400, "facilityId, unit, shiftType, shiftDate, and outgoingNurse are required");
    }

    const handoff = await ShiftHandoff.create({
      facilityId,
      unit,
      shiftType,
      shiftDate: new Date(shiftDate),
      outgoingNurse,
      incomingNurse,
      patients,
      generalNotes,
      equipmentIssues,
      staffingNotes,
      status: "draft",
    });

    return Success(res, 201, "Shift handoff created", handoff);
  } catch (err) {
    return Error(res, 500, "Failed to create shift handoff", err.message);
  }
};

export const getHandoffs = async (req, res) => {
  try {
    const { facilityId, status, from, to, unit, outgoingNurse, incomingNurse } = req.query;

    const filter = {};
    if (facilityId) filter.facilityId = facilityId;
    if (status) filter.status = status;
    if (unit) filter.unit = unit;
    if (outgoingNurse) filter.outgoingNurse = outgoingNurse;
    if (incomingNurse) filter.incomingNurse = incomingNurse;
    if (from || to) {
      filter.shiftDate = {};
      if (from) filter.shiftDate.$gte = new Date(from);
      if (to) filter.shiftDate.$lte = new Date(to);
    }

    const handoffs = await ShiftHandoff.find(filter)
      .populate("outgoingNurse", "fullName profileImage role")
      .populate("incomingNurse", "fullName profileImage role")
      .sort({ shiftDate: -1 });

    const encrypted = await encryptData(JSON.stringify(handoffs));
    return Success(res, 200, "Shift handoffs fetched", encrypted);
  } catch (err) {
    return Error(res, 500, "Failed to fetch shift handoffs", err.message);
  }
};

export const getHandoffById = async (req, res) => {
  try {
    const { id } = req.params;

    const handoff = await ShiftHandoff.findById(id)
      .populate("outgoingNurse", "fullName profileImage role")
      .populate("incomingNurse", "fullName profileImage role");

    if (!handoff) return Error(res, 404, "Shift handoff not found");

    const encrypted = await encryptData(JSON.stringify(handoff));
    return Success(res, 200, "Shift handoff fetched", encrypted);
  } catch (err) {
    return Error(res, 500, "Failed to fetch shift handoff", err.message);
  }
};

export const updateHandoff = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const handoff = await ShiftHandoff.findByIdAndUpdate(id, updates, { new: true });
    if (!handoff) return Error(res, 404, "Shift handoff not found");

    return Success(res, 200, "Shift handoff updated", handoff);
  } catch (err) {
    return Error(res, 500, "Failed to update shift handoff", err.message);
  }
};

export const acknowledgeHandoff = async (req, res) => {
  try {
    const { id } = req.params;

    const handoff = await ShiftHandoff.findById(id);
    if (!handoff) return Error(res, 404, "Shift handoff not found");

    if (handoff.status !== "submitted") {
      return Error(res, 400, "Handoff must be in submitted status to acknowledge");
    }

    handoff.status = "acknowledged";
    handoff.incomingNurse = req.user?._id || handoff.incomingNurse;
    handoff.acknowledgedAt = new Date();
    await handoff.save();

    return Success(res, 200, "Shift handoff acknowledged", handoff);
  } catch (err) {
    return Error(res, 500, "Failed to acknowledge shift handoff", err.message);
  }
};

export const completeHandoff = async (req, res) => {
  try {
    const { id } = req.params;

    const handoff = await ShiftHandoff.findById(id);
    if (!handoff) return Error(res, 404, "Shift handoff not found");

    if (handoff.status !== "acknowledged") {
      return Error(res, 400, "Handoff must be acknowledged before completing");
    }

    handoff.status = "completed";
    handoff.completedAt = new Date();
    await handoff.save();

    return Success(res, 200, "Shift handoff completed", handoff);
  } catch (err) {
    return Error(res, 500, "Failed to complete shift handoff", err.message);
  }
};

// ─── SBAR Reports ─────────────────────────────────────────────────────────────

export const createSbar = async (req, res) => {
  try {
    const {
      facilityId, conversationId, messageId, recipientRole, recipientUser,
      priority, patientName, roomBed, situation, background, assessment, recommendation,
    } = req.body;

    if (!facilityId || !recipientRole || !patientName || !situation || !background || !assessment || !recommendation) {
      return Error(res, 400, "facilityId, recipientRole, patientName, situation, background, assessment, and recommendation are required");
    }

    const sbar = await SbarReport.create({
      facilityId,
      conversationId,
      messageId,
      createdBy: req.user?._id,
      recipientRole,
      recipientUser,
      priority: priority || "ROUTINE",
      patientName,
      roomBed,
      situation,
      background,
      assessment,
      recommendation,
      status: "sent",
    });

    return Success(res, 201, "SBAR report created", sbar);
  } catch (err) {
    return Error(res, 500, "Failed to create SBAR report", err.message);
  }
};

export const getSbars = async (req, res) => {
  try {
    const { facilityId, status, priority, createdBy, recipientUser } = req.query;

    const filter = {};
    if (facilityId) filter.facilityId = facilityId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (createdBy) filter.createdBy = createdBy;
    if (recipientUser) filter.recipientUser = recipientUser;

    const sbars = await SbarReport.find(filter)
      .populate("createdBy", "fullName profileImage role")
      .populate("recipientUser", "fullName profileImage role")
      .populate("acknowledgedBy", "fullName")
      .sort({ createdAt: -1 });

    const encrypted = await encryptData(JSON.stringify(sbars));
    return Success(res, 200, "SBAR reports fetched", encrypted);
  } catch (err) {
    return Error(res, 500, "Failed to fetch SBAR reports", err.message);
  }
};

export const getSbarById = async (req, res) => {
  try {
    const { id } = req.params;

    const sbar = await SbarReport.findById(id)
      .populate("createdBy", "fullName profileImage role")
      .populate("recipientUser", "fullName profileImage role")
      .populate("acknowledgedBy", "fullName")
      .populate("resolvedBy", "fullName");

    if (!sbar) return Error(res, 404, "SBAR report not found");

    const encrypted = await encryptData(JSON.stringify(sbar));
    return Success(res, 200, "SBAR report fetched", encrypted);
  } catch (err) {
    return Error(res, 500, "Failed to fetch SBAR report", err.message);
  }
};

export const acknowledgeSbar = async (req, res) => {
  try {
    const { id } = req.params;

    const sbar = await SbarReport.findById(id);
    if (!sbar) return Error(res, 404, "SBAR report not found");

    if (sbar.status === "resolved") {
      return Error(res, 400, "SBAR report is already resolved");
    }

    sbar.status = "acknowledged";
    sbar.acknowledgedBy = req.user?._id;
    sbar.acknowledgedAt = new Date();
    await sbar.save();

    return Success(res, 200, "SBAR report acknowledged", sbar);
  } catch (err) {
    return Error(res, 500, "Failed to acknowledge SBAR report", err.message);
  }
};

export const resolveSbar = async (req, res) => {
  try {
    const { id } = req.params;
    const { responseNotes } = req.body;

    const sbar = await SbarReport.findById(id);
    if (!sbar) return Error(res, 404, "SBAR report not found");

    sbar.status = "resolved";
    sbar.resolvedBy = req.user?._id;
    sbar.resolvedAt = new Date();
    if (responseNotes) sbar.responseNotes = responseNotes;
    await sbar.save();

    return Success(res, 200, "SBAR report resolved", sbar);
  } catch (err) {
    return Error(res, 500, "Failed to resolve SBAR report", err.message);
  }
};

// ─── Clinical Alerts ──────────────────────────────────────────────────────────

export const createAlert = async (req, res) => {
  try {
    const {
      facilityId, alertType, severity, patientName, roomBed, unit,
      title, description, assignedTo, relatedConversationId,
    } = req.body;

    if (!facilityId || !alertType || !severity || !title || !description) {
      return Error(res, 400, "facilityId, alertType, severity, title, and description are required");
    }

    const alert = await ClinicalAlert.create({
      facilityId,
      createdBy: req.user?._id,
      alertType,
      severity,
      patientName,
      roomBed,
      unit,
      title,
      description,
      assignedTo: assignedTo || [],
      relatedConversationId,
      status: "active",
    });

    return Success(res, 201, "Clinical alert created", alert);
  } catch (err) {
    return Error(res, 500, "Failed to create clinical alert", err.message);
  }
};

export const getAlerts = async (req, res) => {
  try {
    const { facilityId, status, severity, alertType, unit } = req.query;

    const filter = {};
    if (facilityId) filter.facilityId = facilityId;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (alertType) filter.alertType = alertType;
    if (unit) filter.unit = unit;

    const alerts = await ClinicalAlert.find(filter)
      .populate("createdBy", "fullName profileImage role")
      .populate("assignedTo", "fullName profileImage role")
      .populate("acknowledgedBy", "fullName")
      .populate("resolvedBy", "fullName")
      .sort({ createdAt: -1 });

    const encrypted = await encryptData(JSON.stringify(alerts));
    return Success(res, 200, "Clinical alerts fetched", encrypted);
  } catch (err) {
    return Error(res, 500, "Failed to fetch clinical alerts", err.message);
  }
};

export const acknowledgeAlert = async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await ClinicalAlert.findById(id);
    if (!alert) return Error(res, 404, "Clinical alert not found");

    if (alert.status === "resolved") {
      return Error(res, 400, "Alert is already resolved");
    }

    alert.status = "acknowledged";
    alert.acknowledgedBy = req.user?._id;
    alert.acknowledgedAt = new Date();
    await alert.save();

    return Success(res, 200, "Clinical alert acknowledged", alert);
  } catch (err) {
    return Error(res, 500, "Failed to acknowledge clinical alert", err.message);
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;

    const alert = await ClinicalAlert.findById(id);
    if (!alert) return Error(res, 404, "Clinical alert not found");

    alert.status = "resolved";
    alert.resolvedBy = req.user?._id;
    alert.resolvedAt = new Date();
    if (resolutionNotes) alert.resolutionNotes = resolutionNotes;
    await alert.save();

    return Success(res, 200, "Clinical alert resolved", alert);
  } catch (err) {
    return Error(res, 500, "Failed to resolve clinical alert", err.message);
  }
};

export const escalateAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.body;

    const alert = await ClinicalAlert.findById(id);
    if (!alert) return Error(res, 404, "Clinical alert not found");

    if (alert.status === "resolved") {
      return Error(res, 400, "Cannot escalate a resolved alert");
    }

    alert.status = "escalated";
    alert.escalationChain.push({
      userId,
      role,
      notifiedAt: new Date(),
      responded: false,
    });
    await alert.save();

    return Success(res, 200, "Clinical alert escalated", alert);
  } catch (err) {
    return Error(res, 500, "Failed to escalate clinical alert", err.message);
  }
};

// ─── Consultation Requests ────────────────────────────────────────────────────

export const createConsultation = async (req, res) => {
  try {
    const {
      facilityId, consultantType, consultantUser, priority, patientName,
      roomBed, reason, clinicalHistory, currentMedications, specificQuestions,
      relatedConversationId,
    } = req.body;

    if (!facilityId || !consultantType || !patientName || !reason) {
      return Error(res, 400, "facilityId, consultantType, patientName, and reason are required");
    }

    const consultation = await ConsultationRequest.create({
      facilityId,
      requestedBy: req.user?._id,
      requestedRole: req.user?.role,
      consultantType,
      consultantUser,
      priority: priority || "ROUTINE",
      patientName,
      roomBed,
      reason,
      clinicalHistory,
      currentMedications,
      specificQuestions,
      relatedConversationId,
      status: "pending",
    });

    return Success(res, 201, "Consultation request created", consultation);
  } catch (err) {
    return Error(res, 500, "Failed to create consultation request", err.message);
  }
};

export const getConsultations = async (req, res) => {
  try {
    const { facilityId, status, priority, consultantType, consultantUser, requestedBy } = req.query;

    const filter = {};
    if (facilityId) filter.facilityId = facilityId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (consultantType) filter.consultantType = consultantType;
    if (consultantUser) filter.consultantUser = consultantUser;
    if (requestedBy) filter.requestedBy = requestedBy;

    const consultations = await ConsultationRequest.find(filter)
      .populate("requestedBy", "fullName profileImage role")
      .populate("consultantUser", "fullName profileImage role")
      .sort({ createdAt: -1 });

    const encrypted = await encryptData(JSON.stringify(consultations));
    return Success(res, 200, "Consultation requests fetched", encrypted);
  } catch (err) {
    return Error(res, 500, "Failed to fetch consultation requests", err.message);
  }
};

export const acceptConsultation = async (req, res) => {
  try {
    const { id } = req.params;

    const consultation = await ConsultationRequest.findById(id);
    if (!consultation) return Error(res, 404, "Consultation request not found");

    if (consultation.status !== "pending") {
      return Error(res, 400, "Consultation must be in pending status to accept");
    }

    consultation.status = "accepted";
    consultation.consultantUser = req.user?._id || consultation.consultantUser;
    consultation.acceptedAt = new Date();
    await consultation.save();

    return Success(res, 200, "Consultation request accepted", consultation);
  } catch (err) {
    return Error(res, 500, "Failed to accept consultation request", err.message);
  }
};

export const completeConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const { consultNotes, recommendations, followUpRequired, followUpDate } = req.body;

    const consultation = await ConsultationRequest.findById(id);
    if (!consultation) return Error(res, 404, "Consultation request not found");

    if (consultation.status !== "accepted" && consultation.status !== "in_progress") {
      return Error(res, 400, "Consultation must be accepted or in progress to complete");
    }

    consultation.status = "completed";
    consultation.completedAt = new Date();
    if (consultNotes) consultation.consultNotes = consultNotes;
    if (recommendations) consultation.recommendations = recommendations;
    if (followUpRequired !== undefined) consultation.followUpRequired = followUpRequired;
    if (followUpDate) consultation.followUpDate = new Date(followUpDate);
    await consultation.save();

    return Success(res, 200, "Consultation request completed", consultation);
  } catch (err) {
    return Error(res, 500, "Failed to complete consultation request", err.message);
  }
};

export const declineConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const consultation = await ConsultationRequest.findById(id);
    if (!consultation) return Error(res, 404, "Consultation request not found");

    if (consultation.status !== "pending") {
      return Error(res, 400, "Only pending consultations can be declined");
    }

    consultation.status = "declined";
    if (reason) consultation.consultNotes = reason;
    await consultation.save();

    return Success(res, 200, "Consultation request declined", consultation);
  } catch (err) {
    return Error(res, 500, "Failed to decline consultation request", err.message);
  }
};
