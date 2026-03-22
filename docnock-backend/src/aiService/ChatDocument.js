import mongoose from "mongoose";

const chatDocumentSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, default: "text/plain" },
    extractedText: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

chatDocumentSchema.index({ conversationId: 1, isActive: 1 });

export default mongoose.model("ChatDocument", chatDocumentSchema);
