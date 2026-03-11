import mongoose from "mongoose";

const formSubmissionSchema = mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FormTemplate",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    patientLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PatientLink",
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    signaturePath: {
      type: String,
    },
    pdfPath: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "expired"],
      default: "pending",
      index: true,
    },
    completedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

const FormSubmission = mongoose.model("FormSubmission", formSubmissionSchema);
export default FormSubmission;
