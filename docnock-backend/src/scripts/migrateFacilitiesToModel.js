/**
 * Migration Script: Convert facility_center Users to Facility documents
 *
 * This script finds all User records with role="facility_center" and creates
 * corresponding Facility documents, preserving the relationship via legacyUserId.
 *
 * Usage: node -e "require('@babel/register'); require('./src/scripts/migrateFacilitiesToModel')"
 *
 * Idempotent: Safe to run multiple times — skips already-migrated users.
 */
import mongoose from "mongoose";
import User from "../models/user";
import Facility from "../models/Facility";
import FacilityMembership from "../models/FacilityMembership";
import dotenv from "dotenv";

dotenv.config();

const MONGO_HOST = process.env.MONGO_HOST || "localhost";
const MONGO_PORT = process.env.MONGO_PORT || "27017";
const MONGO_DB = process.env.MONGO_DATABASE || "docnock";
const MONGO_USER = process.env.MONGO_USER || "";
const MONGO_PASS = process.env.MONGO_PASSWORD || "";

async function migrate() {
  const uri = MONGO_USER
    ? `mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}`
    : `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}`;

  console.log(`Connecting to ${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}...`);
  await mongoose.connect(uri);
  console.log("Connected.\n");

  const facilityCenterUsers = await User.find({
    role: "facility_center",
    isDeleted: { $ne: true },
  }).lean();

  console.log(`Found ${facilityCenterUsers.length} facility_center users to migrate.\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of facilityCenterUsers) {
    try {
      // Check if already migrated
      const existing = await Facility.findOne({ legacyUserId: user._id });
      if (existing) {
        console.log(`  SKIP: ${user.fullName} (${user.email}) — already migrated as "${existing.name}"`);
        skipped++;
        continue;
      }

      // Create Facility from User data
      const facility = await Facility.create({
        name: user.fullName || user.email || `Facility ${user._id}`,
        address: user.address ? { street: user.address } : undefined,
        location: user.location,
        type: "other",
        fax: user.faxNumber,
        email: user.email,
        phone: user.mobile ? String(user.mobile) : undefined,
        owner: user._id,
        status: user.status ? "active" : "inactive",
        legacyUserId: user._id,
      });

      // Also create a FacilityMembership for the owner
      await FacilityMembership.create({
        userId: user._id,
        facilityId: facility._id,
        role: "facility_center",
        isPrimary: true,
        status: "active",
        joinedAt: user.createdAt || new Date(),
      });

      console.log(`  CREATE: ${facility.name} (slug: ${facility.slug}) from user ${user.email}`);
      created++;
    } catch (err) {
      console.error(`  ERROR: ${user.fullName} (${user.email}) — ${err.message}`);
      errors++;
    }
  }

  console.log(`\nMigration complete: ${created} created, ${skipped} skipped, ${errors} errors.`);

  await mongoose.disconnect();
  console.log("Disconnected.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
