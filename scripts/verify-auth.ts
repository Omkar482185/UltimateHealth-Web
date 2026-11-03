/**
 * Unit checks for the account layer that need no server and no database.
 *
 *   pnpm verify:auth        (also run by `pnpm verify`)
 *
 * Hashing is asynchronous, which is why these live apart from `verify-unit.ts`:
 * that harness is entirely synchronous and its summary is printed at the end of
 * the file, so adding awaits there would have meant restructuring it.
 *
 * What is covered here is the part where a mistake is silent. A wrong hashing
 * comparison or a token that is stored in the clear does not throw, does not fail
 * a type check, and does not look wrong in a browser: it just quietly stops
 * protecting anyone. The database-backed behaviour (sessions resolving,
 * cross-account isolation, cascade deletion) is exercised against a running app
 * instead, because it needs real rows.
 */
import {
  checkPasswordPolicy,
  hashPassword,
  normaliseEmail,
  PASSWORD_ALGO,
  verifyPassword,
} from "@/lib/auth/password";
// Only the pure token helpers are used here. Importing the module does not open
// the database; the connection is created on first use inside those helpers.
import { createSessionToken, hashSessionToken } from "@/lib/auth/session";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

async function main() {
console.log("password hashing");

const password = "correct horse battery staple";
const hash = await hashPassword(password);

{
  const parts = hash.split("$");
  check("stores a self-describing hash", parts[0] === "scrypt" && parts.length === 6, hash.slice(0, 40));
  check("records the cost parameters alongside the hash", hash.startsWith(PASSWORD_ALGO), PASSWORD_ALGO);
  check("never stores the password itself", !hash.includes(password), "password absent");
  check("uses a full-length derived key", Buffer.from(parts[5]!, "base64").length === 64);
}

{
  check("accepts the correct password", await verifyPassword(password, hash));
  check("rejects a wrong password", !(await verifyPassword("wrong password entirely", hash)));
  check(
    "rejects a password differing only in case",
    !(await verifyPassword(password.toUpperCase(), hash)),
  );
}

{
  // Salting is what stops two people with the same password from having the same
  // row, and what stops a precomputed table from being reused across accounts.
  const second = await hashPassword(password);
  check("a second hash of the same password differs", second !== hash);
  check("both still verify", (await verifyPassword(password, second)) && (await verifyPassword(password, hash)));
}

{
  // A malformed row must read as a wrong password, not as a server error, or it
  // would both leak that the account exists and turn a corrupt row into an outage.
  for (const broken of [
    "",
    "not-a-hash",
    "scrypt$32768$8$1$onlyfiveparts",
    "bcrypt$32768$8$1$AAAA$AAAA",
    "scrypt$abc$8$1$AAAA$AAAA",
    "scrypt$0$8$1$AAAA$AAAA",
    "scrypt$32768$8$1$$",
    "scrypt$32768$8$1$AAAA$",
  ]) {
    let threw = false;
    let result = true;
    try {
      result = await verifyPassword(password, broken);
    } catch {
      threw = true;
    }
    if (threw || result) {
      check(`malformed hash is refused without throwing: ${JSON.stringify(broken)}`, false, {
        threw,
        result,
      });
    }
  }
  check("malformed hashes are refused without throwing", true);
}

console.log("password policy");

{
  check("rejects a short password", checkPasswordPolicy("short") === "too-short");
  check("accepts a twelve-character password", checkPasswordPolicy("twelve char!") === null);
  check("rejects an unbounded password", checkPasswordPolicy("x".repeat(201)) === "too-long");
  check("rejects a known-breached password", checkPasswordPolicy("password1234") === "too-common");
  check(
    "is case-insensitive about the common list",
    checkPasswordPolicy("PassWordPassword") === "too-common",
  );
  check(
    "accepts a long passphrase with no symbols",
    checkPasswordPolicy("a long unremarkable passphrase") === null,
  );
}

console.log("email normalisation");

{
  check("lowercases", normaliseEmail("Someone@Example.COM") === "someone@example.com");
  check("trims", normaliseEmail("  someone@example.com  ") === "someone@example.com");
  check(
    "treats a differently cased address as the same account",
    normaliseEmail("A@B.com") === normaliseEmail("a@b.com"),
  );
}

console.log("session tokens");

{
  const a = createSessionToken();
  const b = createSessionToken();
  check("tokens are unique", a !== b);
  check("tokens carry 256 bits of randomness", Buffer.from(a, "base64url").length === 32);
  check("tokens are URL-safe", /^[A-Za-z0-9_-]+$/.test(a), a.slice(0, 12));

  const digest = hashSessionToken(a);
  check("the stored digest is not the token", digest !== a);
  check("the digest is a 64-character hex SHA-256", /^[0-9a-f]{64}$/.test(digest), digest.slice(0, 16));
  check("the digest is deterministic", hashSessionToken(a) === digest);
  check("different tokens give different digests", hashSessionToken(b) !== digest);
  // The database stores the digest, so a database copy must not yield a usable
  // session. This is the check that would fail if someone stored the raw token.
  check("the token cannot be recovered from the stored value", !digest.includes(a));
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
