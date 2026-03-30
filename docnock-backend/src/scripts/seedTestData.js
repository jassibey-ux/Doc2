/**
 * Seed comprehensive test data for E2E testing across all 3 personas.
 * Usage: cd docnock-backend && node -e "require('@babel/register'); require('dotenv/config'); require('./src/scripts/seedTestData')"
 */
import mongoose from "mongoose";
import { mongoconnection } from "../../config/Database";

// Models
import ShiftHandoff from "../models/shiftHandoff";
import SbarReport from "../models/sbarReport";
import ClinicalAlert from "../models/clinicalAlert";
import ConsultationRequest from "../models/consultationRequest";
import Conversation from "../models/conversation";
import Message from "../models/message";
import OnCallSchedule from "../models/onCallSchedule";
import EscalationChain from "../models/escalationChain";
import FormTemplate from "../models/formTemplate";
import FormSubmission from "../models/formSubmission";

// IDs
const SUPERADMIN_ID = "69c499742327f8034a9142cd";
const DOCTOR_ID = "69c499742327f8034a9142d4";
const NURSE_ID = "69c499742327f8034a9142da";
const FACILITY_ID = "69c49cf95c4bb768148731f0";

const oid = (id) => new mongoose.Types.ObjectId(id);
const now = new Date();
const yesterday = new Date(now - 86400000);
const tomorrow = new Date(now.getTime() + 86400000);

async function seed() {
  await mongoconnection();
  console.log("🌱 Seeding test data...\n");

  // ─── 1. SHIFT HANDOFFS ────────────────────────────────────────────────────
  const handoffs = [
    {
      unit: "3B - Medical",
      shiftType: "DAY",
      shiftDate: yesterday,
      status: "submitted",
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
      generalNotes: "Busy shift. Room 302 patient needs close monitoring.",
      patients: [
        { patientName: "Margaret Thompson", roomBed: "301A", diagnosis: "CHF exacerbation", medications: [{ name: "Furosemide 40mg IV" }, { name: "Lisinopril 10mg PO" }], nursingNotes: "I/O monitored. Weight up 2kg from yesterday." },
        { patientName: "Robert Chen", roomBed: "302B", diagnosis: "Post-op hip replacement", medications: [{ name: "Morphine PCA" }, { name: "Enoxaparin 40mg SC" }], nursingNotes: "Pain 6/10. Ambulated with PT x1. DVT prophylaxis ongoing." },
      ],
    },
    {
      unit: "ICU",
      shiftType: "NIGHT",
      shiftDate: now,
      status: "draft",
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
      generalNotes: "ICU night shift. 2 critical patients, 1 stable for transfer.",
      patients: [
        { patientName: "James Rodriguez", roomBed: "ICU-4", diagnosis: "Septic shock", medications: [{ name: "Norepinephrine drip" }, { name: "Vancomycin 1g IV" }, { name: "Meropenem 1g IV" }], nursingNotes: "MAP >65 on vasopressors. Lactate trending down 4.2→2.8. Blood cultures pending." },
      ],
    },
    {
      unit: "3B - Medical",
      shiftType: "EVENING",
      shiftDate: new Date(now - 172800000),
      status: "acknowledged",
      createdBy: oid(NURSE_ID),
      acknowledgedBy: oid(DOCTOR_ID),
      acknowledgedAt: yesterday,
      facilityId: oid(FACILITY_ID),
      generalNotes: "Stable evening. All patients resting.",
      patients: [
        { patientName: "Linda Park", roomBed: "305A", diagnosis: "Pneumonia", medications: [{ name: "Azithromycin 500mg IV" }], nursingNotes: "O2 sats 94% on 2L NC. Chest X-ray ordered for AM." },
      ],
    },
  ];
  await ShiftHandoff.deleteMany({ facilityId: oid(FACILITY_ID) });
  await ShiftHandoff.insertMany(handoffs);
  console.log(`✅ ${handoffs.length} shift handoffs seeded`);

  // ─── 2. SBAR REPORTS ──────────────────────────────────────────────────────
  const sbars = [
    {
      patientName: "Margaret Thompson",
      roomBed: "301A",
      situation: "Patient experiencing increasing shortness of breath and oxygen desaturation to 88% on room air.",
      background: "72-year-old female admitted 2 days ago for CHF exacerbation. History of COPD, HTN, DM type 2. Last BNP was 1200.",
      assessment: "Suspect worsening CHF with possible fluid overload. Bilateral crackles on auscultation. Weight up 2kg in 24hrs.",
      recommendation: "Recommend IV Furosemide 80mg bolus, chest X-ray stat, ABG, and cardiology consult. Consider BiPAP if no improvement in 1 hour.",
      priority: "URGENT",
      status: "sent",
      recipientRole: "physician",
      recipientUser: oid(DOCTOR_ID),
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
    },
    {
      patientName: "Robert Chen",
      roomBed: "302B",
      situation: "Post-op day 2, patient reports increasing calf pain and swelling in right leg.",
      background: "58-year-old male, post right hip arthroplasty. On enoxaparin 40mg SC daily for DVT prophylaxis. BMI 34.",
      assessment: "Concerned for DVT despite prophylaxis. Right calf circumference 4cm greater than left. Positive Homan's sign.",
      recommendation: "Recommend stat duplex ultrasound of right lower extremity. Hold enoxaparin pending results. If positive, transition to therapeutic heparin drip.",
      priority: "CRITICAL",
      status: "acknowledged",
      acknowledgedBy: oid(DOCTOR_ID),
      acknowledgedAt: now,
      recipientRole: "physician",
      recipientUser: oid(DOCTOR_ID),
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
    },
    {
      patientName: "Linda Park",
      roomBed: "305A",
      situation: "Patient requesting medication refill for home medications that were not ordered on admission.",
      background: "45-year-old female admitted for pneumonia. Home meds include metformin 500mg BID and atorvastatin 20mg daily, neither currently ordered.",
      assessment: "No acute issues. Home medications should be continued unless contraindicated.",
      recommendation: "Please review and order home medications: metformin 500mg BID and atorvastatin 20mg daily.",
      priority: "ROUTINE",
      status: "sent",
      recipientRole: "physician",
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
    },
  ];
  await SbarReport.deleteMany({ facilityId: oid(FACILITY_ID) });
  await SbarReport.insertMany(sbars);
  console.log(`✅ ${sbars.length} SBAR reports seeded`);

  // ─── 3. CLINICAL ALERTS ───────────────────────────────────────────────────
  const alerts = [
    {
      alertType: "VITAL_SIGN",
      severity: "CRITICAL",
      title: "Critical Hypotension — ICU-4",
      description: "James Rodriguez BP 78/42 mmHg. MAP 54. Vasopressor titration needed.",
      patientName: "James Rodriguez",
      roomBed: "ICU-4",
      status: "active",
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
    },
    {
      alertType: "FALL_RISK",
      severity: "WARNING",
      title: "Fall Risk — Room 302B",
      description: "Robert Chen attempted to ambulate independently. Found holding onto bed rail. Morse Fall Scale score 55 (high risk).",
      patientName: "Robert Chen",
      roomBed: "302B",
      status: "active",
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
    },
    {
      alertType: "LAB_RESULT",
      severity: "WARNING",
      title: "Critical Lab — Potassium 5.8",
      description: "Margaret Thompson serum potassium 5.8 mEq/L (critical high). Repeat ordered. EKG shows peaked T-waves.",
      patientName: "Margaret Thompson",
      roomBed: "301A",
      status: "acknowledged",
      acknowledgedBy: oid(DOCTOR_ID),
      acknowledgedAt: now,
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
    },
    {
      alertType: "MEDICATION",
      severity: "INFO",
      title: "Medication Reconciliation Needed — 305A",
      description: "Linda Park home medications not yet reconciled on admission. Metformin and atorvastatin pending order.",
      patientName: "Linda Park",
      roomBed: "305A",
      status: "resolved",
      resolvedBy: oid(DOCTOR_ID),
      resolvedAt: now,
      resolvedNotes: "Home medications ordered. Metformin held due to contrast dye procedure tomorrow.",
      createdBy: oid(NURSE_ID),
      facilityId: oid(FACILITY_ID),
    },
  ];
  await ClinicalAlert.deleteMany({ facilityId: oid(FACILITY_ID) });
  await ClinicalAlert.insertMany(alerts);
  console.log(`✅ ${alerts.length} clinical alerts seeded`);

  // ─── 4. CONSULTATION REQUESTS ─────────────────────────────────────────────
  const consultations = [
    {
      patientName: "Margaret Thompson",
      roomBed: "301A",
      priority: "URGENT",
      consultantType: "Cardiology",
      reason: "Worsening CHF with rising BNP despite IV diuretics. Echo recommended to assess EF and valvular function.",
      clinicalHistory: "72F with history of CHF (last EF 35%), HTN, DM2. Admitted for acute exacerbation. BNP 1200, up from 800 at admission.",
      status: "pending",
      requestedBy: oid(DOCTOR_ID),
      facilityId: oid(FACILITY_ID),
    },
    {
      patientName: "Robert Chen",
      roomBed: "302B",
      priority: "CRITICAL",
      consultantType: "Surgery",
      reason: "Suspected DVT post-op day 2 despite prophylaxis. US positive for femoral vein thrombus. Need vascular surgery consult for IVC filter consideration.",
      clinicalHistory: "58M post right hip arthroplasty. Duplex positive for right femoral DVT. Started on heparin drip.",
      status: "accepted",
      requestedBy: oid(DOCTOR_ID),
      facilityId: oid(FACILITY_ID),
    },
    {
      patientName: "Linda Park",
      roomBed: "305A",
      priority: "ROUTINE",
      consultantType: "Pulmonology",
      reason: "Community-acquired pneumonia not responding to 48hrs of antibiotics. CT chest recommended to rule out abscess or empyema.",
      clinicalHistory: "45F with CAP, persistent fever 38.5°C despite azithromycin and ceftriaxone x 48hrs. WBC 14.2.",
      status: "completed",
      completedNotes: "CT chest ordered. No abscess seen. Changed to piperacillin-tazobactam based on culture sensitivities.",
      completedAt: now,
      requestedBy: oid(DOCTOR_ID),
      facilityId: oid(FACILITY_ID),
    },
  ];
  await ConsultationRequest.deleteMany({ facilityId: oid(FACILITY_ID) });
  await ConsultationRequest.insertMany(consultations);
  console.log(`✅ ${consultations.length} consultation requests seeded`);

  // ─── 5. CONVERSATIONS + MESSAGES ──────────────────────────────────────────
  const conv1Id = new mongoose.Types.ObjectId();
  const conv2Id = new mongoose.Types.ObjectId();

  const conversations = [
    {
      _id: conv1Id,
      groupName: "Clinical Team - 3B",
      isGroup: true,
      userlist: [
        { usersId: oid(SUPERADMIN_ID), isAdmin: true },
        { usersId: oid(DOCTOR_ID), isAdmin: false },
        { usersId: oid(NURSE_ID), isAdmin: false },
      ],
      roomName: "clinical-team-3b",
      createdBy: oid(SUPERADMIN_ID),
      count: 3,
    },
    {
      _id: conv2Id,
      groupName: "Handoff Discussion",
      isGroup: true,
      userlist: [
        { usersId: oid(DOCTOR_ID), isAdmin: true },
        { usersId: oid(NURSE_ID), isAdmin: false },
      ],
      roomName: "handoff-discussion",
      createdBy: oid(DOCTOR_ID),
      count: 2,
    },
  ];

  await Conversation.deleteMany({ roomName: { $in: ["clinical-team-3b", "handoff-discussion"] } });
  await Conversation.insertMany(conversations);
  console.log(`✅ ${conversations.length} conversations seeded`);

  const messages = [
    // Clinical Team conversation
    { groupId: conv1Id, senderID: oid(NURSE_ID), message: "Good morning team. Just started my shift on 3B. We have 4 patients today, 2 need close monitoring.", timestamp: new Date(now - 7200000) },
    { groupId: conv1Id, senderID: oid(DOCTOR_ID), message: "Thanks Sarah. I'll be rounding at 9am. Can you have the latest vitals ready for Thompson in 301A? Her BNP was trending up.", timestamp: new Date(now - 6600000) },
    { groupId: conv1Id, senderID: oid(NURSE_ID), message: "Will do. Her O2 sats dropped to 88% on RA about 30 minutes ago. I put her on 2L NC and she's back to 94%. SBAR sent.", timestamp: new Date(now - 6000000) },
    { groupId: conv1Id, senderID: oid(SUPERADMIN_ID), message: "I've escalated the cardiology consult for Thompson. They should be by within the hour.", timestamp: new Date(now - 5400000) },
    // Handoff conversation
    { groupId: conv2Id, senderID: oid(NURSE_ID), message: "Dr. Wilson, the evening shift handoff report is ready for review. Key items: Thompson fluid overload, Chen possible DVT, Park not responding to antibiotics.", timestamp: new Date(now - 3600000) },
    { groupId: conv2Id, senderID: oid(DOCTOR_ID), message: "Got it. I've acknowledged the handoff. Can you order a stat duplex US for Chen's right leg? I'm concerned about the DVT risk given his BMI.", timestamp: new Date(now - 3000000) },
    { groupId: conv2Id, senderID: oid(NURSE_ID), message: "Duplex ordered. Results should be back within 2 hours. I'll page you immediately when they're in.", timestamp: new Date(now - 2400000) },
  ];

  await Message.deleteMany({ groupId: { $in: [conv1Id, conv2Id] } });
  await Message.insertMany(messages);
  console.log(`✅ ${messages.length} messages seeded`);

  // ─── 6. FORM TEMPLATE + SUBMISSION ────────────────────────────────────────
  const templateId = new mongoose.Types.ObjectId();
  const templates = [
    {
      _id: templateId,
      name: "Admission Assessment Form",
      description: "Standard admission assessment for new patients",
      category: "admission",
      fields: [
        { id: "chiefComplaint", type: "textarea", label: "Chief Complaint", required: true, order: 1 },
        { id: "allergyStatus", type: "select", label: "Allergy Status", required: true, order: 2, options: ["No Known Allergies", "Drug Allergy", "Food Allergy", "Environmental Allergy", "Multiple Allergies"] },
        { id: "admissionDate", type: "date", label: "Admission Date", required: true, order: 3 },
        { id: "codeStatus", type: "select", label: "Code Status", required: true, order: 4, options: ["Full Code", "DNR", "DNR/DNI", "Comfort Care Only"] },
        { id: "nurseSignature", type: "signature", label: "Admitting Nurse Signature", required: true, order: 5 },
      ],
      createdBy: oid(SUPERADMIN_ID),
      facilityId: oid(FACILITY_ID),
      status: "active",
    },
  ];

  await FormTemplate.deleteMany({ facilityId: oid(FACILITY_ID) });
  await FormTemplate.insertMany(templates);
  console.log(`✅ ${templates.length} form templates seeded`);

  const submissions = [
    {
      templateId: templateId,
      assignedTo: oid(NURSE_ID),
      assignedBy: oid(DOCTOR_ID),
      patientName: "Margaret Thompson",
      status: "pending",
      facilityId: oid(FACILITY_ID),
      expiresAt: new Date(now.getTime() + 7 * 86400000),
    },
  ];

  await FormSubmission.deleteMany({ facilityId: oid(FACILITY_ID) });
  await FormSubmission.insertMany(submissions);
  console.log(`✅ ${submissions.length} form submissions seeded`);

  // ─── 7. ON-CALL SCHEDULES (additional) ────────────────────────────────────
  // Check if already exist for today
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const existingToday = await OnCallSchedule.countDocuments({
    facilityId: oid(FACILITY_ID),
    startTime: { $gte: todayStart },
    endTime: { $lte: todayEnd },
  });

  if (existingToday === 0) {
    const todaySchedules = [
      {
        facilityId: oid(FACILITY_ID),
        userId: oid(DOCTOR_ID),
        role: "physician",
        startTime: todayStart,
        endTime: todayEnd,
        isBackup: false,
        createdBy: oid(SUPERADMIN_ID),
      },
      {
        facilityId: oid(FACILITY_ID),
        userId: oid(NURSE_ID),
        role: "nurse",
        startTime: todayStart,
        endTime: todayEnd,
        isBackup: false,
        createdBy: oid(SUPERADMIN_ID),
      },
    ];
    await OnCallSchedule.insertMany(todaySchedules);
    console.log(`✅ ${todaySchedules.length} on-call schedules seeded for today`);
  } else {
    console.log(`⏭️  On-call schedules already exist for today (${existingToday})`);
  }

  // ─── 8. ESCALATION CHAIN ─────────────────────────────────────────────────
  const existingChain = await EscalationChain.countDocuments({ facilityId: oid(FACILITY_ID) });
  if (existingChain === 0) {
    await EscalationChain.create({
      name: "Critical Alert Escalation",
      facilityId: oid(FACILITY_ID),
      triggerCondition: "critical_alert_unacknowledged",
      steps: [
        { order: 1, role: "nurse", delayMinutes: 0, notificationMethod: "push" },
        { order: 2, role: "physician", delayMinutes: 5, notificationMethod: "push" },
        { order: 3, role: "charge_nurse", delayMinutes: 15, notificationMethod: "call" },
      ],
      isActive: true,
      createdBy: oid(SUPERADMIN_ID),
    });
    console.log("✅ 1 escalation chain seeded");
  } else {
    console.log(`⏭️  Escalation chain already exists`);
  }

  console.log("\n🎉 All test data seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
