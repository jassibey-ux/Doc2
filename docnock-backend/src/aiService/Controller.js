import logger from "../utils/logger";
import mongoose from "mongoose";
import Message from "../models/message";
import Conversation from "../models/Conversation";
import User from "../models/user";
import ShiftHandoff from "../models/ShiftHandoff";
import AiTemplate from "./AiTemplate";
import ChatDocument from "./ChatDocument";
import { summarizeConversation } from "./summarization";
import { callClaude } from "./claude";

// In-memory cache for summaries (15-minute TTL)
const summaryCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

const cleanCache = () => {
  const now = Date.now();
  for (const [key, entry] of summaryCache) {
    if (now - entry.timestamp > CACHE_TTL) summaryCache.delete(key);
  }
};

/**
 * POST /ai/summarize-conversation
 * Body: { conversationId, lastN: 50 }
 */
export const summarizeConv = async (req, res) => {
  try {
    const { conversationId, lastN = 50 } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "conversationId is required" });
    }

    // Check cache
    cleanCache();
    const cacheKey = `${conversationId}_${lastN}`;
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({ success: true, summary: cached.summary, cached: true });
    }

    // Verify user has access to this conversation
    const userId = req.user?._id || req.user?.id;
    const conversation = await Conversation.findOne({
      _id: conversationId,
      "userlist.userid": userId,
    });

    if (!conversation) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Fetch last N messages
    const messages = await Message.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      isDeleted: { $ne: true },
      video: false,
    })
      .sort({ createdAt: -1 })
      .limit(lastN)
      .lean();

    if (!messages.length) {
      return res.status(200).json({
        success: true,
        summary: "No messages found in this conversation.",
      });
    }

    // Reverse to chronological order
    messages.reverse();

    // Build participant map for de-identification
    const senderIds = [...new Set(messages.map((m) => m.senderID?.toString()).filter(Boolean))];
    const users = await User.find(
      { _id: { $in: senderIds } },
      { _id: 1, role: 1 }
    ).lean();

    const participantMap = {};
    users.forEach((u) => {
      participantMap[u._id.toString()] = { role: u.role || "staff" };
    });

    const summary = await summarizeConversation(messages, participantMap);

    // Cache the result
    summaryCache.set(cacheKey, { summary, timestamp: Date.now() });

    return res.status(200).json({ success: true, summary, cached: false });
  } catch (error) {
    logger.error({ err: error }, "AI Summarization Error");
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate summary",
    });
  }
};

/**
 * POST /ai/document-query
 * Body: { documentText, question }
 */
export const documentQuery = async (req, res) => {
  try {
    const { documentText, question } = req.body;

    if (!documentText || !question) {
      return res.status(400).json({ success: false, message: "documentText and question are required" });
    }

    if (documentText.length > 100000) {
      return res.status(400).json({ success: false, message: "Document text exceeds 100,000 character limit" });
    }

    if (question.length > 500) {
      return res.status(400).json({ success: false, message: "Question exceeds 500 character limit" });
    }

    const systemPrompt = `You are a clinical document assistant for a healthcare platform. Answer questions based only on the provided document content. Rules:
- Be concise and accurate
- Do NOT fabricate information not present in the document
- If the answer is not in the document, say so clearly
- Use bullet points for multi-part answers
- Maintain clinical accuracy`;

    const userPrompt = `Document:\n---\n${documentText}\n---\n\nQuestion: ${question}`;

    const answer = await callClaude(systemPrompt, userPrompt);

    return res.status(200).json({ success: true, answer });
  } catch (error) {
    logger.error({ err: error }, "AI Document Query Error");
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process document query",
    });
  }
};

/**
 * POST /ai/summarize-handoff
 * Body: { handoffId }
 */
export const summarizeHandoff = async (req, res) => {
  try {
    const { handoffId } = req.body;

    if (!handoffId) {
      return res.status(400).json({ success: false, message: "handoffId is required" });
    }

    // Check cache
    cleanCache();
    const cacheKey = `handoff_${handoffId}`;
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({ success: true, summary: cached.summary, cached: true });
    }

    const handoff = await ShiftHandoff.findById(handoffId).lean();
    if (!handoff) {
      return res.status(404).json({ success: false, message: "Handoff not found" });
    }

    // De-identify and build structured text
    const patientLines = (handoff.patients || []).map((p, i) => {
      const label = `Patient ${i + 1}`;
      const parts = [`${label} — Room: ${p.roomBed || "N/A"}, Diagnosis: ${p.diagnosis || "N/A"}`];
      if (p.codeStatus) parts.push(`  Code Status: ${p.codeStatus}`);
      if (p.vitals) {
        const v = p.vitals;
        parts.push(`  Vitals — BP: ${v.bp || "N/A"}, HR: ${v.hr || "N/A"}, Temp: ${v.temp || "N/A"}, O2: ${v.o2sat || "N/A"}, RR: ${v.rr || "N/A"}`);
      }
      if (p.medications?.length) {
        parts.push(`  Medications: ${p.medications.map(m => `${m.name} ${m.dose || ""}`).join(", ")}`);
      }
      if (p.allergies?.length) parts.push(`  Allergies: ${p.allergies.join(", ")}`);
      if (p.fallRisk) parts.push(`  Fall Risk: ${p.fallRisk}`);
      if (p.nursingNotes) parts.push(`  Nursing Notes: ${p.nursingNotes}`);
      if (p.concerns) parts.push(`  Concerns: ${p.concerns}`);
      if (p.pendingOrders) parts.push(`  Pending Orders: ${p.pendingOrders}`);
      return parts.join("\n");
    });

    const handoffText = [
      `Unit: ${handoff.unit || "N/A"}, Shift: ${handoff.shiftType || "N/A"}`,
      handoff.generalNotes ? `General Notes: ${handoff.generalNotes}` : "",
      handoff.equipmentIssues ? `Equipment Issues: ${handoff.equipmentIssues}` : "",
      handoff.staffingNotes ? `Staffing Notes: ${handoff.staffingNotes}` : "",
      "",
      ...patientLines,
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are a clinical handoff summarization assistant. Summarize the shift handoff into a concise briefing for the incoming nurse. Rules:
- Use bullet points
- Lead with the most critical patients
- Highlight: abnormal vitals, pending actions, fall risks, upcoming medication times
- Use Patient 1/2/3 labels, never real names
- Keep it actionable — what does the incoming nurse need to do?`;

    const userPrompt = `Summarize this shift handoff:\n\n${handoffText}`;

    const summary = await callClaude(systemPrompt, userPrompt);

    summaryCache.set(cacheKey, { summary, timestamp: Date.now() });

    return res.status(200).json({ success: true, summary, cached: false });
  } catch (error) {
    logger.error({ err: error }, "AI Handoff Summarization Error");
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to summarize handoff",
    });
  }
};

/**
 * POST /ai/generate-family-update
 * Body: { conversationId }
 */
export const generateFamilyUpdate = async (req, res) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "conversationId is required" });
    }

    const userId = req.user?._id || req.user?.id;
    const conversation = await Conversation.findOne({
      _id: conversationId,
      "userlist.userid": userId,
    });

    if (!conversation) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const messages = await Message.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      isDeleted: { $ne: true },
      video: false,
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    if (!messages.length) {
      return res.status(200).json({
        success: true,
        update: "No recent activity to summarize for families.",
      });
    }

    messages.reverse();

    // De-identify
    const senderIds = [...new Set(messages.map((m) => m.senderID?.toString()).filter(Boolean))];
    const users = await User.find({ _id: { $in: senderIds } }, { _id: 1, role: 1 }).lean();
    const participantMap = {};
    users.forEach((u) => {
      participantMap[u._id.toString()] = { role: u.role || "staff" };
    });

    const deidentified = messages.map((msg) => {
      const sender = participantMap[msg.senderID?.toString()] || { role: "Staff" };
      const roleLabel = sender.role ? sender.role.charAt(0).toUpperCase() + sender.role.slice(1) : "Staff";
      return `${roleLabel}: ${msg.message || "[attachment]"}`;
    });

    const transcript = deidentified.join("\n");

    const systemPrompt = `You are a family communication assistant for a nursing facility. Generate a warm, family-friendly update about a patient's care based on staff conversations. Rules:
- Use simple, everyday language — no clinical jargon
- Be warm and reassuring, but honest
- Refer to the patient as "your loved one" — never use real names
- Focus on: daily activities, care updates, general wellbeing, and positive moments
- Never include specific medication names, dosages, or detailed medical data
- Keep to 2-3 short paragraphs
- Write in a tone that would comfort a family member`;

    const userPrompt = `Based on these recent staff conversations about a patient, generate a family-friendly update:\n\n${transcript}`;

    const update = await callClaude(systemPrompt, userPrompt);

    return res.status(200).json({ success: true, update });
  } catch (error) {
    logger.error({ err: error }, "AI Family Update Error");
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate family update",
    });
  }
};

/**
 * GET /ai/templates
 * Query: { category? }
 */
export const getAiTemplates = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;

    let templates = await AiTemplate.find(filter).sort({ isDefault: -1, name: 1 }).lean();

    // Seed defaults if none exist
    if (templates.length === 0) {
      await seedDefaultTemplates();
      templates = await AiTemplate.find(filter).sort({ isDefault: -1, name: 1 }).lean();
    }

    return res.status(200).json({ success: true, templates });
  } catch (error) {
    logger.error({ err: error }, "AI Templates Fetch Error");
    return res.status(500).json({ success: false, message: "Failed to fetch templates" });
  }
};

/**
 * POST /ai/templates
 * Body: { name, description, category, systemPrompt, userPromptTemplate, variables, icon }
 */
export const createAiTemplate = async (req, res) => {
  try {
    const { name, description, category, systemPrompt, userPromptTemplate, variables, icon } = req.body;

    if (!name || !systemPrompt || !userPromptTemplate) {
      return res.status(400).json({ success: false, message: "name, systemPrompt, and userPromptTemplate are required" });
    }

    const template = await AiTemplate.create({
      name,
      description: description || name,
      category: category || "clinical",
      systemPrompt,
      userPromptTemplate,
      variables: variables || [],
      icon: icon || "bx-file",
      createdBy: req.user?._id || req.user?.id,
      isDefault: false,
    });

    return res.status(201).json({ success: true, template });
  } catch (error) {
    logger.error({ err: error }, "AI Template Create Error");
    return res.status(500).json({ success: false, message: "Failed to create template" });
  }
};

/**
 * POST /ai/templates/:templateId/run
 * Body: { variables: { key: value } }
 */
export const runAiTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { variables = {} } = req.body;

    const template = await AiTemplate.findById(templateId).lean();
    if (!template || !template.isActive) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    // Replace {{placeholders}} in the user prompt template
    let userPrompt = template.userPromptTemplate;
    for (const [key, value] of Object.entries(variables)) {
      userPrompt = userPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    const answer = await callClaude(template.systemPrompt, userPrompt);

    return res.status(200).json({ success: true, answer, templateName: template.name });
  } catch (error) {
    logger.error({ err: error }, "AI Template Run Error");
    return res.status(500).json({ success: false, message: "Failed to run template" });
  }
};

// Seed default templates
async function seedDefaultTemplates() {
  const defaults = [
    {
      name: "Summarize Patient Chart",
      description: "Paste chart notes to get a concise clinical summary",
      category: "clinical",
      icon: "bx-file-find",
      systemPrompt: "You are a clinical summarization assistant. Summarize the patient chart notes into a concise, structured summary. Include: chief complaint, key findings, current medications, and plan of care. Use bullet points.",
      userPromptTemplate: "Summarize these patient chart notes:\n\n{{chartNotes}}",
      variables: [{ key: "chartNotes", label: "Chart Notes", placeholder: "Paste patient chart notes here...", type: "textarea" }],
    },
    {
      name: "Discharge Summary Draft",
      description: "Generate a discharge summary from admission and treatment notes",
      category: "clinical",
      icon: "bx-log-out-circle",
      systemPrompt: "You are a clinical documentation assistant. Generate a structured discharge summary. Include: admission diagnosis, hospital course, procedures performed, discharge medications, follow-up instructions, and patient education provided. Be thorough but concise.",
      userPromptTemplate: "Generate a discharge summary from these notes:\n\nAdmission Notes:\n{{admissionNotes}}\n\nTreatment Notes:\n{{treatmentNotes}}",
      variables: [
        { key: "admissionNotes", label: "Admission Notes", placeholder: "Paste admission notes...", type: "textarea" },
        { key: "treatmentNotes", label: "Treatment Notes", placeholder: "Paste treatment/progress notes...", type: "textarea" },
      ],
    },
    {
      name: "Translate to Family Language",
      description: "Convert clinical notes into family-friendly language",
      category: "family",
      icon: "bx-message-rounded-detail",
      systemPrompt: "You are a healthcare communication specialist. Translate clinical notes into simple, warm, family-friendly language. Rules: No medical jargon. Use 'your loved one' instead of patient names. Be reassuring but honest. Focus on what matters to families. Never include specific medication dosages.",
      userPromptTemplate: "Translate these clinical notes into family-friendly language:\n\n{{clinicalNotes}}",
      variables: [{ key: "clinicalNotes", label: "Clinical Notes", placeholder: "Paste clinical notes to translate...", type: "textarea" }],
    },
    {
      name: "Medication Review",
      description: "Review a medication list for potential interactions and concerns",
      category: "clinical",
      icon: "bx-capsule",
      systemPrompt: "You are a clinical pharmacology assistant. Review the provided medication list and identify: potential drug interactions, duplicate therapies, medications requiring monitoring, and any concerns. Note: This is for informational purposes only and does not replace clinical pharmacist review.",
      userPromptTemplate: "Review this medication list:\n\n{{medicationList}}\n\nPatient context (if any): {{patientContext}}",
      variables: [
        { key: "medicationList", label: "Medication List", placeholder: "List medications with doses...", type: "textarea" },
        { key: "patientContext", label: "Patient Context (optional)", placeholder: "Age, diagnoses, allergies...", type: "text" },
      ],
    },
    {
      name: "Incident Report Draft",
      description: "Generate a structured incident report from details",
      category: "admin",
      icon: "bx-error-circle",
      systemPrompt: "You are a healthcare compliance assistant. Generate a structured incident report. Include: date/time, location, persons involved (use role titles only), description of incident, immediate actions taken, and recommended follow-up. Use objective, factual language. Do not assign blame.",
      userPromptTemplate: "Generate an incident report from these details:\n\n{{incidentDetails}}",
      variables: [{ key: "incidentDetails", label: "Incident Details", placeholder: "Describe what happened, when, where, who was involved...", type: "textarea" }],
    },
  ];

  for (const tmpl of defaults) {
    await AiTemplate.create({ ...tmpl, isDefault: true, isActive: true });
  }
}

// ─── Chat Document Panel Handlers ────────────────────────────────────────

/**
 * POST /ai/chat-documents
 * Body: { conversationId, fileName, fileType, extractedText }
 */
export const uploadChatDocument = async (req, res) => {
  try {
    const { conversationId, fileName, fileType, extractedText } = req.body;

    if (!conversationId || !fileName || !extractedText) {
      return res.status(400).json({ success: false, message: "conversationId, fileName, and extractedText are required" });
    }

    if (extractedText.length > 200000) {
      return res.status(400).json({ success: false, message: "Document too large. Maximum 200,000 characters." });
    }

    const doc = await ChatDocument.create({
      conversationId,
      userId: req.user?._id || req.user?.id,
      fileName,
      fileType: fileType || "text/plain",
      extractedText,
      fileSize: extractedText.length,
    });

    return res.status(201).json({
      success: true,
      document: { _id: doc._id, fileName: doc.fileName, fileType: doc.fileType, fileSize: doc.fileSize, createdAt: doc.createdAt },
    });
  } catch (error) {
    logger.error({ err: error }, "Chat Document Upload Error");
    return res.status(500).json({ success: false, message: "Failed to upload document" });
  }
};

/**
 * GET /ai/chat-documents?conversationId=xxx&search=yyy
 */
export const listChatDocuments = async (req, res) => {
  try {
    const { conversationId, search } = req.query;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: "conversationId is required" });
    }

    const filter = { conversationId, isActive: true };
    if (search) {
      filter.fileName = { $regex: search, $options: "i" };
    }

    const documents = await ChatDocument.find(filter)
      .select("fileName fileType fileSize createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, documents });
  } catch (error) {
    logger.error({ err: error }, "Chat Document List Error");
    return res.status(500).json({ success: false, message: "Failed to list documents" });
  }
};

/**
 * DELETE /ai/chat-documents/:documentId
 */
export const deleteChatDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const doc = await ChatDocument.findByIdAndUpdate(documentId, { isActive: false }, { new: true });
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    return res.status(200).json({ success: true, message: "Document removed" });
  } catch (error) {
    logger.error({ err: error }, "Chat Document Delete Error");
    return res.status(500).json({ success: false, message: "Failed to delete document" });
  }
};

/**
 * POST /ai/chat-documents/query
 * Body: { conversationId, documentIds: [id, ...], question }
 */
export const queryChatDocuments = async (req, res) => {
  try {
    const { conversationId, documentIds, question } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, message: "question is required" });
    }
    if (!documentIds || documentIds.length === 0) {
      return res.status(400).json({ success: false, message: "Select at least one document" });
    }

    // Fetch selected documents
    const docs = await ChatDocument.find({
      _id: { $in: documentIds },
      isActive: true,
    }).lean();

    if (docs.length === 0) {
      return res.status(404).json({ success: false, message: "No documents found" });
    }

    // Build context from selected documents
    const docContext = docs
      .map((d, i) => `--- Document ${i + 1}: ${d.fileName} ---\n${d.extractedText}`)
      .join("\n\n");

    const systemPrompt = `You are a clinical document assistant. Answer questions based ONLY on the provided documents. If the information is not in the documents, say so. Be concise and accurate. Do not fabricate information.`;
    const userPrompt = `Documents:\n\n${docContext}\n\n---\n\nQuestion: ${question}`;

    const answer = await callClaude(systemPrompt, userPrompt);

    return res.status(200).json({ success: true, answer });
  } catch (error) {
    logger.error({ err: error }, "Chat Document Query Error");
    return res.status(500).json({ success: false, message: "Failed to query documents" });
  }
};
