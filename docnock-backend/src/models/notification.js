import mongoose from "mongoose";

const NotificationRecordSchema = new mongoose.Schema({
    receiverid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }, 
    createdid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },  
    groupid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        required: true
    },
    is_read: {
      type: Boolean,
      default:false
    },
    message: {
      type: String,
      required: true
    },
    priority: {
      type: String,
      enum: ['ROUTINE', 'URGENT', 'CRITICAL'],
      default: 'ROUTINE',
      index: true
    },
    acknowledgedAt: {
      type: Date
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  }, { timestamps: true });

  const Notification = mongoose.model("Notification", NotificationRecordSchema);
export default Notification;