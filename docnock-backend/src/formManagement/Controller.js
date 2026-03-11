import FormTemplate from "../models/FormTemplate";
import FormSubmission from "../models/FormSubmission";
import { Success, Error } from "../utils/customeResponse";

// ─── Form Templates ─────────────────────────────────────────────────────────

export const createTemplate = async (req, res) => {
  try {
    const { name, category, fields, facilityId } = req.body;
    if (!name || !fields || !fields.length) {
      return Error(res, 400, "name and fields are required");
    }
    const template = await FormTemplate.create({
      name,
      category,
      fields,
      facilityId,
      createdBy: req.user?._id,
    });
    return Success(res, 201, "Form template created", template);
  } catch (err) {
    return Error(res, 500, "Failed to create template", err.message);
  }
};

export const listTemplates = async (req, res) => {
  try {
    const { facilityId, category } = req.query;
    const filter = { isActive: true };
    if (facilityId) filter.facilityId = facilityId;
    if (category) filter.category = category;
    const templates = await FormTemplate.find(filter)
      .sort({ createdAt: -1 })
      .populate("createdBy", "fullName");
    return Success(res, 200, "Templates retrieved", templates);
  } catch (err) {
    return Error(res, 500, "Failed to list templates", err.message);
  }
};

export const getTemplate = async (req, res) => {
  try {
    const template = await FormTemplate.findById(req.params.id);
    if (!template) return Error(res, 404, "Template not found");
    return Success(res, 200, "Template retrieved", template);
  } catch (err) {
    return Error(res, 500, "Failed to get template", err.message);
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const template = await FormTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!template) return Error(res, 404, "Template not found");
    return Success(res, 200, "Template updated", template);
  } catch (err) {
    return Error(res, 500, "Failed to update template", err.message);
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const template = await FormTemplate.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!template) return Error(res, 404, "Template not found");
    return Success(res, 200, "Template deactivated");
  } catch (err) {
    return Error(res, 500, "Failed to delete template", err.message);
  }
};

// ─── Form Submissions ───────────────────────────────────────────────────────

export const sendForm = async (req, res) => {
  try {
    const { templateId, conversationId, patientLink } = req.body;
    if (!templateId || !conversationId) {
      return Error(res, 400, "templateId and conversationId are required");
    }
    const template = await FormTemplate.findById(templateId);
    if (!template) return Error(res, 404, "Template not found");

    const submission = await FormSubmission.create({
      templateId,
      conversationId,
      patientLink,
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
    });
    return Success(res, 201, "Form sent", submission);
  } catch (err) {
    return Error(res, 500, "Failed to send form", err.message);
  }
};

export const submitForm = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, signaturePath, pdfPath } = req.body;
    const submission = await FormSubmission.findById(id);
    if (!submission) return Error(res, 404, "Submission not found");
    if (submission.status !== "pending") {
      return Error(res, 400, "Form is no longer pending");
    }

    submission.data = data;
    submission.signaturePath = signaturePath;
    submission.pdfPath = pdfPath;
    submission.status = "completed";
    submission.completedAt = new Date();
    submission.submittedBy = req.user?._id;
    await submission.save();

    return Success(res, 200, "Form submitted", submission);
  } catch (err) {
    return Error(res, 500, "Failed to submit form", err.message);
  }
};

export const getSubmission = async (req, res) => {
  try {
    const submission = await FormSubmission.findById(req.params.id)
      .populate("templateId")
      .populate("submittedBy", "fullName")
      .populate("patientLink");
    if (!submission) return Error(res, 404, "Submission not found");
    return Success(res, 200, "Submission retrieved", submission);
  } catch (err) {
    return Error(res, 500, "Failed to get submission", err.message);
  }
};

export const listSubmissions = async (req, res) => {
  try {
    const { conversationId, status, templateId } = req.query;
    const filter = {};
    if (conversationId) filter.conversationId = conversationId;
    if (status) filter.status = status;
    if (templateId) filter.templateId = templateId;

    const submissions = await FormSubmission.find(filter)
      .sort({ createdAt: -1 })
      .populate("templateId", "name category")
      .populate("submittedBy", "fullName");
    return Success(res, 200, "Submissions retrieved", submissions);
  } catch (err) {
    return Error(res, 500, "Failed to list submissions", err.message);
  }
};
