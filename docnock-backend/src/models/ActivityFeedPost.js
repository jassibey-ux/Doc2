import mongoose from "mongoose";

const activityFeedPostSchema = mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["update", "photo", "event", "announcement"],
      default: "update",
    },
    title: {
      type: String,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    images: [
      {
        url: { type: String, required: true },
        caption: { type: String, default: "" },
      },
    ],
    visibility: {
      type: String,
      enum: ["all_families", "specific_patients"],
      default: "all_families",
    },
    linkedPatientConversations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
      },
    ],
    likesCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for efficient feed queries
activityFeedPostSchema.index({ facilityId: 1, isActive: 1, createdAt: -1 });

const ActivityFeedPost = mongoose.model("ActivityFeedPost", activityFeedPostSchema);
export default ActivityFeedPost;
