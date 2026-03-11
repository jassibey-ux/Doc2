import mongoose from "mongoose";

const geoJsonSchema = new mongoose.Schema(
  {
      type: {
          type: String,
          default: "Point"
      },
      coordinates: {
          type: [Number],
          index: "2dsphere",
          default: [0.0, 0.0]
      }
  }
)
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required."],
      trim: true,
      index: true,
      minlength: [2, "Full name must be at least 2 characters."],
      maxlength: [50, "Full name must be less than 50 characters."],
    },
    rolename: {
      type: String,
      trim: true,
      index: true,
    },
    uniqueId: {
      type: Number,
      required: [true, "Unique Id is required."],
      trim: true,
      index: true,
      unique: true,
    },
    userIds: [{ // this field is used for store senior user
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    }],
    createdBy: { // this field is used for store senior user
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default:null
    },
    location: geoJsonSchema,
    email: {
  type: String,
  required: [true, "Email is required."],
  lowercase: true,
  trim: true,
  match: [
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    "Please enter a valid email address.",
  ],
},
    mobile: {
      type: Number,
      required: [true, "Mobile number is required."],
      validate: {
        validator: (v) => /^\d{10}$/.test(v),
        message: "Mobile number must be 10 digits.",
      },
    },
    otp: {
      type: String,
    },
    otpExpires: {
      type: Date,
      allowNull: true,
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      minlength: [6, "Password must be at least 6 characters."],
    },
    role: {
      type: String,
      index:true,
      enum: ["superadmin", "facility_center", "physician","nurse","subadmin","other","family_member"],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    geoLocation: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      default: true,
      enum:[true,false]
    },
    lock: {
      type: Boolean,
      default: false,
      enum:[true,false]
    },
    lockExpires: {
      type: Date,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaSecret: {
      type: String, // encrypted TOTP secret
    },
    mfaBackupCodes: [{
      type: String, // hashed backup codes
    }],
    profilePicture: {
      originalName: { type: String },
      savedName: { type: String }
    },
    login_attempts: {
      type: Number,
      required:true,
      default: 0
    },
    is_verified: {
      type: Boolean,
      required:true,
      default: false
    },
    address: {
      type: String,
      trim: true,
      index: true,
    },
    maxDistance: {
      type: Number,
      index: true,
    },
    fcm_token:{
      type: String,
      trim: true,
      index: true,
    },
     device_token:{
      type: String,
      trim: true,
      index: true,
    },
    forgot_password:{
      type: Boolean,
      default: false
    },
    faxNumber: {
      type: String,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
export default User;
