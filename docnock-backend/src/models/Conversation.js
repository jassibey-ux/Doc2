import mongoose from "mongoose";
const conversationSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: [true, "Group Name is required."],
      trim: true,
      index: true,
    },
    count: {
      type: Number,
      required: [true, "Count is required."],
      trim: true,
      index: true,
    },
    userlist: [
      {
        userid: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          index: true,
        },
        name: {
          type: String,
          require: true,
        },
        profilePicture: {
          originalName: { type: String },
          savedName: { type: String },
        },
        status: {
          type: String,
        },
      },
    ],
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId },
        userName: { type: String },
        userImage: { type: String },
        userIdentity: { type: String },
        isAudioMuted: { type: Boolean, default: false },
        isVideoMuted: { type: Boolean, default: false },
      },
    ],
    callstatus: {
      type: String,
      default: null,
    },
    roomName: { type: String, default: null },
    callerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    callerName: { type: String, default: null },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      default: true,
    },
    latestMessage: {
      type: String,
      default: "",
    },
    groupPicture: {
      originalName: { type: String },
      savedName: { type: String },
    },
    senderID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    senderName: { type: String, default: null },
    senderprofilePicture: {
      originalName: { type: String },
      savedName: { type: String },
    },
    hiddenFor: [{  // Users who have hidden/deleted this chat
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    // ─── Channel Topic ──────────────────────────────────────────────────────
    topic: {
      text: { type: String, default: '' },
      setBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      setAt: { type: Date },
    },
    // ─── Pinned Messages ────────────────────────────────────────────────────
    pinnedMessages: [{
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
      pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      pinnedAt: { type: Date, default: Date.now },
    }],
    // ─── Facility Scoping ──────────────────────────────────────────────────
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      index: true,
    },
    crossFacility: {
      type: Boolean,
      default: false,
    },
    groupType: {
      type: String,
      enum: ["open", "clinical_team", "admin_only", "custom"],
      default: "open",
    },
    // messageCount: { type: Number, default: 0 }, // Track total messages
    // unreadCount: {
    //   type: Map,
    //   of: Number, // Store unread count for each user
    //   default: {},
    // },
  },
  { timestamps: true }
);

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
