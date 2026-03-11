import mongoose from "mongoose";

const fieldSchema = mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "number", "date", "select", "multiselect", "boolean", "signature", "textarea"],
      required: true,
    },
    required: { type: Boolean, default: false },
    options: [{ type: String }],
    validation: {
      min: { type: Number },
      max: { type: Number },
      pattern: { type: String },
    },
  },
  { _id: false }
);

const formTemplateSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ["admission", "discharge", "medication_reconciliation", "fall_risk", "custom"],
      default: "custom",
    },
    fields: [fieldSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const FormTemplate = mongoose.model("FormTemplate", formTemplateSchema);
export default FormTemplate;
