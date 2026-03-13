import mongoose from "mongoose";
const { Schema, model } = mongoose;

const ShiftHandoffSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    unit: { type: String, required: true },
    shiftType: {
      type: String,
      enum: ["day-to-evening", "evening-to-night", "night-to-day", "DAY", "EVENING", "NIGHT"],
      required: true,
    },
    shiftDate: { type: Date, default: Date.now, index: true },
    outgoingNurse: { type: Schema.Types.ObjectId, ref: "User" },
    incomingNurse: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["draft", "submitted", "acknowledged", "completed"],
      default: "draft",
      index: true,
    },
    patients: [
      {
        patientName: { type: String, required: true },
        roomBed: { type: String },
        diagnosis: { type: String },
        codeStatus: { type: String, enum: ["full", "DNR", "DNI", "comfort"], default: "full" },
        allergies: [String],
        diet: { type: String },
        vitals: {
          bp: String,
          hr: String,
          temp: String,
          o2sat: String,
          rr: String,
        },
        ivAccess: { type: String },
        medications: [
          {
            name: String,
            dose: String,
            nextDue: Date,
            notes: String,
          },
        ],
        recentLabs: { type: String },
        pendingOrders: { type: String },
        fallRisk: { type: String, enum: ["low", "moderate", "high"], default: "low" },
        isolationPrecautions: { type: String },
        nursingNotes: { type: String },
        concerns: { type: String },
      },
    ],
    generalNotes: { type: String },
    equipmentIssues: { type: String },
    staffingNotes: { type: String },
    acknowledgedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

ShiftHandoffSchema.index({ facilityId: 1, shiftDate: -1 });
ShiftHandoffSchema.index({ outgoingNurse: 1, status: 1 });

export default model("ShiftHandoff", ShiftHandoffSchema);
