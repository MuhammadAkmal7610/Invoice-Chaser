import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be configured with at least 32 characters.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptIntegrationSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptIntegrationSecret(value: string) {
  const [version, encodedIv, encodedTag, encodedSecret] = value.split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedSecret) {
    throw new Error("Saved integration credentials are not encrypted. Please reconnect the integration.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedSecret, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Could not decrypt integration credentials. Verify INTEGRATION_ENCRYPTION_KEY and reconnect the integration.");
  }
}
