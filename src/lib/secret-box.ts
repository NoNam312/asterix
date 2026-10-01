// Server-only: encrypts the API tokens people connect (Jira, Todoist, GitHub…) with
// AES-256-GCM and INTEGRATION_SECRET, so the database never holds a readable token.
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class SecretBoxError extends Error {}

function key() {
  const secret = process.env.INTEGRATION_SECRET;
  const buf = secret ? Buffer.from(secret, "base64") : null;
  if (!buf || buf.length !== 32) throw new SecretBoxError("Integrations aren't set up on this server yet (INTEGRATION_SECRET).");
  return buf;
}

export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(stored: string) {
  const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
