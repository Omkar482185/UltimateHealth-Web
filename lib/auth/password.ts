/**
 * Password hashing.
 *
 * `node:crypto` scrypt, chosen because it is in the standard library: adding a
 * password hashing dependency to a local-first project that is trying to avoid
 * dependencies would be a poor trade, and scrypt is memory-hard, which is what
 * makes a stolen hash expensive to attack rather than merely slow.
 *
 * The stored value is self-describing:
 *
 *   scrypt$N$r$p$saltB64$hashB64
 *
 * so the cost parameters travel with each hash. Raising the cost later is then a
 * per-record migration rather than a rewrite of every password, and an old hash
 * still verifies with the parameters it was made under.
 *
 * scrypt is deliberately blocking and CPU-heavy. At the parameters below a single
 * verification takes roughly a tenth of a second, which is the intended cost: it
 * is what makes offline guessing expensive. It also means this must never be
 * called in a loop over untrusted input, which is why the login route rate-limits
 * before it hashes anything.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Cost parameters. N is the CPU/memory cost, r the block size, p the
 * parallelisation factor. These match the commonly recommended interactive
 * settings: 2^15 * 8 * 128 bytes is about 32 MiB per hash.
 */
const PARAMS = { N: 32768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** scrypt's default maxmem is too low for N = 32768, so it is raised explicitly. */
const MAX_MEM = 128 * PARAMS.N * PARAMS.r * 2;

export const PASSWORD_ALGO = `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return `${PASSWORD_ALGO}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing for a malformed or unrecognised hash, so a
 * corrupted row reads as "wrong password" instead of as a server error that would
 * tell an attacker the account exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [scheme, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (scheme !== "scrypt") return false;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N <= 1 || r <= 0 || p <= 0) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch {
    return false;
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export type PasswordProblem = "too-short" | "too-long" | "too-common";

/**
 * Password policy.
 *
 * Length is the only composition rule, deliberately. Requiring a digit and a
 * symbol while allowing "Password1!" produces weaker passwords than a longer
 * minimum does, so the policy here asks for length and rejects a short list of
 * the passwords that appear at the top of every breach corpus.
 *
 * The upper bound exists because scrypt hashes the whole input; an unbounded
 * password is a cheap way to make the server do expensive work.
 */
export function checkPasswordPolicy(password: string): PasswordProblem | null {
  if (password.length < 12) return "too-short";
  if (password.length > 200) return "too-long";
  const common = new Set([
    "password1234",
    "passwordpassword",
    "qwertyuiop12",
    "123456789012",
    "letmein12345",
    "iloveyou1234",
    "administrator",
    "chikungunya1",
  ]);
  if (common.has(password.toLowerCase())) return "too-common";
  return null;
}

export function describePasswordProblem(problem: PasswordProblem): string {
  switch (problem) {
    case "too-short":
      return "Use at least 12 characters. A short phrase of several words is easier to remember than a scrambled single word.";
    case "too-long":
      return "Passwords are limited to 200 characters.";
    case "too-common":
      return "That password appears in public breach lists. Please choose a different one.";
  }
}

/**
 * Normalises an email for storage and lookup.
 *
 * Lowercasing the whole address and trimming is the pragmatic choice. It is not
 * strictly RFC-correct, since a domain may in principle be case-sensitive, but no
 * real mail provider is, and treating "A@b.com" and "a@b.com" as different
 * accounts would let one person hold two accounts without noticing.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
