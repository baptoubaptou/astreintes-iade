import { randomInt } from "crypto";

export const CODE_VALIDITE_MS = 15 * 60 * 1000;

export function genererCodeVerification(): string {
  return String(randomInt(10000, 100000));
}
