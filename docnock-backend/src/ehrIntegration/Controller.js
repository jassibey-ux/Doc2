import PatientLink from "../models/PatientLink";
import { Success, Error } from "../utils/customeResponse";
import logger from "../utils/logger";
import { createAuditEntry } from "../middleware/auditMiddleware";
import {
  searchPatients,
  getPatientSummaryCached,
  listFacilities,
} from "./pccClient";

// ─── Link a Conversation to a PCC Patient ────────────────────────────────────

export const linkPatient = async (req, res) => {
  try {
    const { conversationId, pccPatientId, pccFacilityId, patientName } = req.body;
    if (!conversationId || !pccPatientId) {
      return Error(res, 400, "conversationId and pccPatientId are required");
    }

    const link = await PatientLink.findOneAndUpdate(
      { docnockConversationId: conversationId },
      {
        docnockConversationId: conversationId,
        pccPatientId,
        pccFacilityId,
        patientName,
        linkedBy: req.user?._id || req.user?.userId,
      },
      { upsert: true, new: true }
    );

    logger.info({ conversationId, pccPatientId }, "Patient linked to conversation");

    createAuditEntry({
      userId: req.user?._id || req.user?.userId,
      userRole: req.user?.role,
      action: "PHI_CREATE",
      resourceType: "PatientLink",
      resourceId: link._id,
      details: { conversationId, pccPatientId, pccFacilityId },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return Success(res, 201, "Patient linked to conversation", link);
  } catch (err) {
    logger.error({ err }, "Failed to link patient");
    return Error(res, 500, "Failed to link patient", err.message);
  }
};

// ─── Unlink Patient ──────────────────────────────────────────────────────────

export const unlinkPatient = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const result = await PatientLink.findOneAndDelete({
      docnockConversationId: conversationId,
    });
    if (!result) return Error(res, 404, "No patient link found");

    logger.info({ conversationId }, "Patient unlinked from conversation");

    createAuditEntry({
      userId: req.user?._id || req.user?.userId,
      userRole: req.user?.role,
      action: "PHI_DELETE",
      resourceType: "PatientLink",
      resourceId: result._id,
      details: { conversationId, pccPatientId: result.pccPatientId },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return Success(res, 200, "Patient unlinked");
  } catch (err) {
    logger.error({ err }, "Failed to unlink patient");
    return Error(res, 500, "Failed to unlink patient", err.message);
  }
};

// ─── Get Patient Link for a Conversation ─────────────────────────────────────

export const getPatientLink = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const link = await PatientLink.findOne({
      docnockConversationId: conversationId,
    }).populate("linkedBy", "fullName");

    if (!link) return Success(res, 200, "No patient linked", null);
    return Success(res, 200, "Patient link found", link);
  } catch (err) {
    logger.error({ err }, "Failed to fetch patient link");
    return Error(res, 500, "Failed to fetch patient link", err.message);
  }
};

// ─── Fetch Patient Summary from PCC ──────────────────────────────────────────

export const getPatientSummary = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const link = await PatientLink.findOne({
      docnockConversationId: conversationId,
    });
    if (!link) {
      return Success(res, 200, "No patient linked to this conversation", null);
    }

    const summary = await getPatientSummaryCached(
      link.pccFacilityId,
      link.pccPatientId
    );

    createAuditEntry({
      userId: req.user?._id || req.user?.userId,
      userRole: req.user?.role,
      action: "PHI_ACCESS",
      resourceType: "PCC_Patient",
      resourceId: link._id,
      details: { pccPatientId: link.pccPatientId, pccFacilityId: link.pccFacilityId },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    return Success(res, 200, "Patient summary fetched", {
      link,
      summary,
    });
  } catch (err) {
    // PCC API errors should degrade gracefully
    if (err.response?.status === 404) {
      return Success(res, 200, "Patient record not found in PointClickCare", null);
    }
    logger.error({ err }, "Failed to fetch patient data from PCC");
    return Error(res, 502, "Failed to fetch patient data from PCC", err.message);
  }
};

// ─── Search PCC Patients ─────────────────────────────────────────────────────

export const searchPccPatients = async (req, res) => {
  try {
    const { facilityId, query } = req.query;
    if (!facilityId || !query) {
      return Error(res, 400, "facilityId and query are required");
    }

    const results = await searchPatients(facilityId, query);
    return Success(res, 200, "PCC patients found", results);
  } catch (err) {
    logger.error({ err, facilityId: req.query?.facilityId }, "Failed to search PCC patients");
    return Error(res, 502, "Failed to search PCC patients", err.message);
  }
};

// ─── List PCC Facilities ─────────────────────────────────────────────────────

export const getPccFacilities = async (req, res) => {
  try {
    const facilities = await listFacilities();
    return Success(res, 200, "PCC facilities fetched", facilities);
  } catch (err) {
    logger.error({ err }, "Failed to fetch PCC facilities");
    return Error(res, 502, "Failed to fetch PCC facilities", err.message);
  }
};
