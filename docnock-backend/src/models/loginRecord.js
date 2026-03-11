import mongoose from "mongoose";

const loginRecordSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    logoutDate: {
      type: Date,
      allowNull: true
    },
    IP: {
      type: String,
      required: true
    }
  }, { timestamps: true });

  const LoginRecord = mongoose.model("LoginRecord", loginRecordSchema);
export default LoginRecord;
