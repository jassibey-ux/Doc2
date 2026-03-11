import mongoose from "mongoose";

const escalationStepSchema = mongoose.Schema(
  {
    order: {
      type: Number,
      required: true,
    },
    userId: {
      // Specific person to notify (optional — use role instead for on-call routing)
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    role: {
      // Any person currently on-call in this role at the facility (optional)
      type: String,
      enum: ["physician", "nurse", "charge_nurse", "specialist"],
    },
    delayMinutes: {
      // Wait this many minutes before escalating to this step (if previous step unacknowledged)
      type: Number,
      default: 5,
    },
    notificationMethod: {
      type: String,
      enum: ["push", "sms", "call"],
      default: "push",
    },
  },
  { _id: false }
);

const escalationChainSchema = mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    steps: [escalationStepSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const EscalationChain = mongoose.model("EscalationChain", escalationChainSchema);

export default EscalationChain;
