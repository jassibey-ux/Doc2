import mongoose from "mongoose";
const { Schema, model } = mongoose;

const addressSchema = new Schema(
  {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, trim: true },
    country: { type: String, trim: true, default: "US" },
  },
  { _id: false }
);

const geoJsonSchema = new Schema(
  {
    type: { type: String, default: "Point" },
    coordinates: { type: [Number], index: "2dsphere", default: [0.0, 0.0] },
  },
  { _id: false }
);

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    beds: { type: Number, default: 0 },
    occupied: { type: Number, default: 0 },
    nurses: { type: Number, default: 0 },
  },
  { _id: false }
);

const FacilitySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Facility name is required"],
      trim: true,
      index: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [200, "Name must be less than 200 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    address: addressSchema,
    location: geoJsonSchema,
    type: {
      type: String,
      enum: ["hospital", "clinic", "senior_living", "rehab", "pediatric", "other"],
      default: "other",
      index: true,
    },
    licenseNumber: { type: String, trim: true },
    phone: { type: String, trim: true },
    fax: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    capacity: {
      totalBeds: { type: Number, default: 0 },
      icuBeds: { type: Number, default: 0 },
    },
    departments: [departmentSchema],
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
      index: true,
    },
    settings: { type: Schema.Types.Mixed, default: {} },
    legacyUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      sparse: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Compound indexes
FacilitySchema.index({ owner: 1, status: 1 });
FacilitySchema.index({ isDeleted: 1, status: 1 });
FacilitySchema.index({ name: "text" });

// Auto-generate slug from name before save
FacilitySchema.pre("save", function (next) {
  if (this.isModified("name") || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 100);
  }
  next();
});

export default model("Facility", FacilitySchema);
