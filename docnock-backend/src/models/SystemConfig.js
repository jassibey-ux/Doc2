import mongoose from "mongoose";

const systemConfigSchema = mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  defaultValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  category: {
    type: String,
    required: true,
    enum: ["authentication", "file_management", "communication", "caching", "system"],
    index: true,
  },
  dataType: {
    type: String,
    required: true,
    enum: ["number", "string", "boolean", "string_array"],
  },
  label: String,
  description: String,
  unit: String,
  validation: {
    min: Number,
    max: Number,
    pattern: String,
    options: [String],
  },
  requiresRestart: {
    type: Boolean,
    default: false,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now,
  },
});

const SystemConfig = mongoose.model("SystemConfig", systemConfigSchema);

export default SystemConfig;
