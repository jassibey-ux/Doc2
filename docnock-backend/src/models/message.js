import mongoose from "mongoose";

const messageModel = mongoose.Schema(
  {
    senderID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    message: {
      type: String
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      index:true
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
     isImportant: {
      type: Boolean,
      default: false
    },
    attachments: [
      {
        type: Object,
        path: String
      }
    ],
    hiddenBy: { 
      type: [String],  // Array of User IDs who have hidden this message
      default: [] 
  },
  video: {
    type: Boolean,
    default:false
  },
  messageId:{
    type: String
  },
  timestamp: {
    type: Number
  },
  status: {
  type: String,
  enum: ['SENT', 'DELIVERED', 'READ'],
  default: 'SENT'
  },
  priority: {
    type: String,
    enum: ['ROUTINE', 'URGENT', 'CRITICAL'],
    default: 'ROUTINE',
    index: true,
  },
  deliveredAt: Date,
  readAt: Date,
  acknowledgedAt: Date,
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  encrypted: {
    type: Boolean,
    default: false,
  },
  encryptedMessage: {
    type: Object, // { iv, encryptedData, authTag }
  },
  // ─── Reactions ──────────────────────────────────────────────────────────
  reactions: [{
    emoji: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String },
    createdAt: { type: Date, default: Date.now },
  }],
  // ─── @Mentions ──────────────────────────────────────────────────────────
  mentions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    displayName: { type: String },
    type: { type: String, enum: ['user', 'role', 'all'], default: 'user' },
    role: { type: String },
  }],
  // ─── Threading ──────────────────────────────────────────────────────────
  threadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    index: true,
    default: null,
  },
  threadReplyCount: { type: Number, default: 0 },
  threadLastReplyAt: { type: Date },
  threadParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // ─── Per-user read receipts (URGENT/CRITICAL only) ──────────────────────
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    readAt: { type: Date, default: Date.now },
  }],
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageModel);

export default Message;

