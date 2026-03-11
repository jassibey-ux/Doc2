import mongoose from "mongoose";

const onCallScheduleSchema = mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["physician", "nurse", "charge_nurse", "specialist"],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
      index: true,
    },
    timezone: {
      type: String,
      required: true,
      default: "America/New_York",
    },
    isBackup: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Compound index for efficient on-call-now queries
onCallScheduleSchema.index({ facilityId: 1, role: 1, startTime: 1, endTime: 1 });

const OnCallSchedule = mongoose.model("OnCallSchedule", onCallScheduleSchema);

export default OnCallSchedule;
