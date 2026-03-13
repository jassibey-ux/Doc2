import mongoose from "mongoose";
const { Schema, model } = mongoose;

const ConsultationRequestSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    requestedRole: { type: String },
    consultantType: {
      type: String,
      enum: [
        "physician", "specialist", "psychiatrist", "dietitian",
        "pt", "ot", "st", "social_worker", "pharmacist", "other",
        "Cardiology", "Pulmonology", "Neurology", "Nephrology",
        "Gastroenterology", "Infectious Disease", "Endocrinology",
        "Orthopedics", "Psychiatry", "Surgery", "Other",
      ],
      required: true,
    },
    consultantUser: { type: Schema.Types.ObjectId, ref: "User" },
    priority: {
      type: String,
      enum: ["ROUTINE", "URGENT", "CRITICAL"],
      default: "ROUTINE",
      index: true,
    },
    patientName: { type: String, required: true },
    roomBed: { type: String },
    reason: { type: String, required: true },
    clinicalHistory: { type: String },
    currentMedications: { type: String },
    specificQuestions: { type: String },
    status: {
      type: String,
      enum: ["pending", "accepted", "in_progress", "completed", "declined", "cancelled"],
      default: "pending",
      index: true,
    },
    acceptedAt: { type: Date },
    completedAt: { type: Date },
    consultNotes: { type: String },
    recommendations: { type: String },
    followUpRequired: { type: Boolean, default: false },
    followUpDate: { type: Date },
    relatedConversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
  },
  { timestamps: true }
);

ConsultationRequestSchema.index({ facilityId: 1, status: 1 });
ConsultationRequestSchema.index({ consultantUser: 1, status: 1 });

export default model("ConsultationRequest", ConsultationRequestSchema);
