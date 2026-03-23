import mongoose from "mongoose";

const unreadCountSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

unreadCountSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

const UnreadCount = mongoose.model("UnreadCount", unreadCountSchema);
export default UnreadCount;
