import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "scrypt";

export function hashPassword(password: string): string {
  const normalizedPassword = password.trim();
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalizedPassword, salt, 64).toString("hex");

  return `${HASH_ALGORITHM}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, hashHex] = storedHash.split(":");

  if (algorithm !== HASH_ALGORITHM || !salt || !hashHex) {
    return false;
  }

  const expectedHash = Buffer.from(hashHex, "hex");
  const actualHash = Buffer.from(
    scryptSync(password.trim(), salt, expectedHash.length).toString("hex"),
    "hex"
  );

  if (expectedHash.length !== actualHash.length) {
    return false;
  }

  return timingSafeEqual(expectedHash, actualHash);
}

export function validatePasswordRules(password: string): string | null {
  const value = password.trim();
  if (value.length < 6) {
    return "A senha deve possuir no mínimo 6 caracteres.";
  }

  return null;
}

export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const random = randomBytes(8);
  let generated = "";

  for (const byte of random) {
    generated += alphabet[byte % alphabet.length];
  }

  return generated;
}
