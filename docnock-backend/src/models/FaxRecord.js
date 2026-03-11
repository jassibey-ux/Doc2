import mongoose from "mongoose";

const faxRecordSchema = mongoose.Schema(
  {
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
      index: true,
    },
    faxNumber: {
      type: String,
      required: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    pdfPath: {
      type: String,
    },
    pageCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["received", "read", "forwarded", "sent", "failed"],
      default: "received",
    },
    phaxioId: {
      type: String,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
    },
    sentAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

const FaxRecord = mongoose.model("FaxRecord", faxRecordSchema);

export default FaxRecord;
