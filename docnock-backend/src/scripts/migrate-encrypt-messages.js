/**
 * Migration script: Encrypt existing plaintext messages with AES-256-GCM.
 *
 * Usage:
 *   PHI_ENCRYPTION_KEY=<base64key> DB_HOST=... DB_NAME=... node -r dotenv/config src/scripts/migrate-encrypt-messages.js
 *
 * Run on staging first, verify, then production.
 * This script is idempotent — it only encrypts messages where encrypted === false.
 */

import mongoose from "mongoose";
import crypto from "crypto";

// Load env
import "dotenv/config";

const PHI_KEY_B64 = process.env.PHI_ENCRYPTION_KEY;
if (!PHI_KEY_B64) {
  console.error("PHI_ENCRYPTION_KEY env var is required.");
  process.exit(1);
}

const encryptionKey = Buffer.from(PHI_KEY_B64, "base64");
if (encryptionKey.length !== 32) {
  console.error("PHI_ENCRYPTION_KEY must be exactly 32 bytes (base64-encoded).");
  process.exit(1);
}

function encryptPHI(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { iv: iv.toString("hex"), encryptedData: encrypted, authTag };
}

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = process.env.DB_PORT || "27017";
const dbName = process.env.DB_NAME || "docnock";
const dbUser = process.env.DB_USERNAME || "";
const dbPass = process.env.DB_PASSWORD || "";

const mongoUrl = `mongodb://${dbHost}:${dbPort}/${dbName}`;

async function migrate() {
  console.log(`Connecting to ${dbHost}:${dbPort}/${dbName}...`);
  await mongoose.connect(mongoUrl, {
    user: dbUser || undefined,
    pass: dbPass || undefined,
  });
  console.log("Connected.");

  const Message = mongoose.connection.collection("messages");

  const total = await Message.countDocuments({});
  const unencrypted = await Message.countDocuments({
    $or: [{ encrypted: false }, { encrypted: { $exists: false } }],
    message: { $ne: null, $ne: "", $ne: "[encrypted]" },
  });

  console.log(`Total messages: ${total}`);
  console.log(`Unencrypted messages to process: ${unencrypted}`);

  if (unencrypted === 0) {
    console.log("Nothing to encrypt. Exiting.");
    process.exit(0);
  }

  const BATCH_SIZE = 500;
  let processed = 0;

  const cursor = Message.find({
    $or: [{ encrypted: false }, { encrypted: { $exists: false } }],
    message: { $ne: null, $ne: "", $ne: "[encrypted]" },
  }).batchSize(BATCH_SIZE);

  const bulkOps = [];

  for await (const doc of cursor) {
    if (!doc.message || doc.message === "[encrypted]") continue;

    const encryptedMsg = encryptPHI(doc.message);

    bulkOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            encrypted: true,
            encryptedMessage: encryptedMsg,
            message: "[encrypted]",
          },
        },
      },
    });

    if (bulkOps.length >= BATCH_SIZE) {
      await Message.bulkWrite(bulkOps);
      processed += bulkOps.length;
      console.log(`Encrypted ${processed}/${unencrypted} messages...`);
      bulkOps.length = 0;
    }
  }

  // Flush remaining
  if (bulkOps.length > 0) {
    await Message.bulkWrite(bulkOps);
    processed += bulkOps.length;
  }

  console.log(`\nMigration complete. ${processed} messages encrypted.`);

  // Verify
  const remaining = await Message.countDocuments({
    $or: [{ encrypted: false }, { encrypted: { $exists: false } }],
    message: { $ne: null, $ne: "", $ne: "[encrypted]" },
  });
  console.log(`Remaining unencrypted: ${remaining}`);

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
