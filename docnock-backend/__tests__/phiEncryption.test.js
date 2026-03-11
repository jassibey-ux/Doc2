// Set env var BEFORE importing the module (module captures it at load time)
process.env.PHI_ENCRYPTION_KEY = Buffer.from("test-encryption-key-32-bytes!!!!").toString("base64");

import { encryptPHI, decryptPHI, isEncryptedPHI, safeDecryptPHI } from "../src/utils/phiEncryption";

describe("PHI Encryption (AES-256-GCM)", () => {
  const testData = "This is sensitive patient data";

  test("encryptPHI returns an object with iv, encryptedData, and authTag", () => {
    const encrypted = encryptPHI(testData);
    expect(encrypted).toHaveProperty("iv");
    expect(encrypted).toHaveProperty("encryptedData");
    expect(encrypted).toHaveProperty("authTag");
    expect(typeof encrypted.iv).toBe("string");
    expect(typeof encrypted.encryptedData).toBe("string");
    expect(typeof encrypted.authTag).toBe("string");
  });

  test("decryptPHI correctly reverses encryption", () => {
    const encrypted = encryptPHI(testData);
    const decrypted = decryptPHI(encrypted);
    expect(decrypted).toBe(testData);
  });

  test("different IVs are generated for identical plaintexts", () => {
    const encrypted1 = encryptPHI(testData);
    const encrypted2 = encryptPHI(testData);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
  });

  test("isEncryptedPHI correctly identifies encrypted objects", () => {
    const encrypted = encryptPHI(testData);
    expect(isEncryptedPHI(encrypted)).toBe(true);
    expect(isEncryptedPHI("plaintext")).toBe(false);
    expect(isEncryptedPHI(null)).toBeFalsy();
    expect(isEncryptedPHI({})).toBeFalsy();
    expect(isEncryptedPHI({ iv: "a" })).toBeFalsy();
  });

  test("safeDecryptPHI returns plaintext for encrypted data", () => {
    const encrypted = encryptPHI(testData);
    expect(safeDecryptPHI(encrypted)).toBe(testData);
  });

  test("safeDecryptPHI returns the original value for non-encrypted data", () => {
    expect(safeDecryptPHI("plain string")).toBe("plain string");
    expect(safeDecryptPHI(null)).toBe(null);
    expect(safeDecryptPHI(123)).toBe(123);
  });

  test("decryptPHI throws on tampered data", () => {
    const encrypted = encryptPHI(testData);
    encrypted.encryptedData = encrypted.encryptedData.slice(0, -2) + "ff";
    expect(() => decryptPHI(encrypted)).toThrow();
  });

  test("encryptPHI returns null for empty/null/non-string input", () => {
    expect(encryptPHI("")).toBeNull();
    expect(encryptPHI(null)).toBeNull();
    expect(encryptPHI(undefined)).toBeNull();
  });

  test("encrypts and decrypts unicode content", () => {
    const unicode = "Patient name with accents: \u00e9\u00e8\u00ea";
    const encrypted = encryptPHI(unicode);
    const decrypted = decryptPHI(encrypted);
    expect(decrypted).toBe(unicode);
  });
});
