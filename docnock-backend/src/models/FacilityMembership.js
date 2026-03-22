import mongoose from "mongoose";
const { Schema, model } = mongoose;

const FacilityMembershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["superadmin", "facility_center", "subadmin", "physician", "nurse", "other", "family_member"],
      required: true,
    },
    isPrimary: { type: Boolean, default: false },
    permissions: [{ type: String }], // module code overrides (F, P, N, S, O, V, C, R)
    status: {
      type: String,
      enum: ["active", "suspended", "invited"],
      default: "active",
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    joinedAt: { type: Date },
  },
  { timestamps: true }
);

// A user can only have one membership per facility
FacilityMembershipSchema.index({ userId: 1, facilityId: 1 }, { unique: true });
// Fast lookup: all staff at a facility
FacilityMembershipSchema.index({ facilityId: 1, status: 1 });
// Fast lookup: all facilities for a user
FacilityMembershipSchema.index({ userId: 1, status: 1, isPrimary: -1 });

export default model("FacilityMembership", FacilityMembershipSchema);
