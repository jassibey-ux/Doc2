import mongoose from "mongoose";

const patientFamilyLinkSchema = mongoose.Schema(
  {
    patientConversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    familyUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    relationshipType: {
      type: String,
      enum: ["spouse", "parent", "child", "sibling", "guardian", "power_of_attorney", "other"],
      default: "other",
    },
    pocUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    familyChatConversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    familyEmail: {
      type: String,
      required: true,
    },
    familyName: {
      type: String,
    },
    consentSigned: {
      type: Boolean,
      default: false,
    },
    consentDate: {
      type: Date,
    },
    magicLinkToken: {
      type: String,
      index: true,
    },
    magicLinkUsed: {
      type: Boolean,
      default: false,
    },
    magicLinkExpires: {
      type: Date,
    },
    accessLevel: {
      type: String,
      enum: ["read_only", "two_way"],
      default: "read_only",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const PatientFamilyLink = mongoose.model("PatientFamilyLink", patientFamilyLinkSchema);
export default PatientFamilyLink;
