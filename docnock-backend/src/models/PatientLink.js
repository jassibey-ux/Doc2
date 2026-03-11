import mongoose from "mongoose";

const patientLinkSchema = mongoose.Schema(
  {
    docnockConversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      unique: true,
      index: true,
    },
    pccPatientId: {
      type: String,
      required: true,
      index: true,
    },
    pccFacilityId: {
      type: String,
    },
    patientName: {
      type: String,
    },
    linkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const PatientLink = mongoose.model("PatientLink", patientLinkSchema);

export default PatientLink;
