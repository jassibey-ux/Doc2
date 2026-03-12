import mongoose from "mongoose";
const { Schema, model } = mongoose;

const ClinicalAlertSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    alertType: {
      type: String,
      enum: [
        "fall", "medication_error", "vital_change", "lab_critical",
        "elopement", "behavioral", "skin_integrity", "pain",
        "infection_control", "equipment_failure", "other",
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical", "emergency"],
      required: true,
      index: true,
    },
    patientName: { type: String },
    roomBed: { type: String },
    unit: { type: String },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "acknowledged", "in_progress", "resolved", "escalated"],
      default: "active",
      index: true,
    },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: "User" }],
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    resolutionNotes: { type: String },
    escalationChain: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        role: String,
        notifiedAt: Date,
        responded: { type: Boolean, default: false },
      },
    ],
    relatedConversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
  },
  { timestamps: true }
);

ClinicalAlertSchema.index({ facilityId: 1, status: 1, severity: -1 });

export default model("ClinicalAlert", ClinicalAlertSchema);
