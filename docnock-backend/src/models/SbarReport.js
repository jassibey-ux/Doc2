import mongoose from "mongoose";
const { Schema, model } = mongoose;

const SbarReportSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", index: true },
    messageId: { type: Schema.Types.ObjectId, ref: "Message" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientRole: {
      type: String,
      enum: ["physician", "nurse", "charge_nurse", "specialist"],
      required: true,
    },
    recipientUser: { type: Schema.Types.ObjectId, ref: "User" },
    priority: {
      type: String,
      enum: ["ROUTINE", "URGENT", "CRITICAL"],
      default: "ROUTINE",
      index: true,
    },
    patientName: { type: String, required: true },
    roomBed: { type: String },
    situation: { type: String, required: true },
    background: { type: String, required: true },
    assessment: { type: String, required: true },
    recommendation: { type: String, required: true },
    status: {
      type: String,
      enum: ["sent", "viewed", "acknowledged", "resolved"],
      default: "sent",
      index: true,
    },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    responseNotes: { type: String },
  },
  { timestamps: true }
);

SbarReportSchema.index({ createdBy: 1, status: 1 });
SbarReportSchema.index({ recipientUser: 1, status: 1 });

export default model("SbarReport", SbarReportSchema);
