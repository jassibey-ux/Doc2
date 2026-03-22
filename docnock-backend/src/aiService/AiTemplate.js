import mongoose from "mongoose";

const aiTemplateSchema = mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["clinical", "family", "admin"],
      default: "clinical",
    },
    icon: {
      type: String,
      default: "bx-file",
    },
    systemPrompt: {
      type: String,
      required: true,
    },
    userPromptTemplate: {
      type: String,
      required: true,
    },
    variables: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        placeholder: { type: String, default: "" },
        type: { type: String, enum: ["text", "textarea"], default: "textarea" },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

aiTemplateSchema.index({ isDefault: 1, isActive: 1 });

const AiTemplate = mongoose.model("AiTemplate", aiTemplateSchema);
export default AiTemplate;
