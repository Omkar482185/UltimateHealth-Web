/**
 * Session cookie handling and the current-user helper.
 *
 * Kept apart from `lib/auth/session.ts` so that the session logic can be tested
 * without a request context. Everything in this file needs `next/headers` and is
 * therefore only usable from a Route Handler, a Server Function or a Server
 * Component.
 *
 * Cookie attributes, and why:
 *
 *  - `httpOnly` keeps the token out of reach of any script on the page, so an
 *    injected script cannot read the session even if the page is compromised.
 *  - `sameSite: "lax"` means the cookie is not attached to cross-site POSTs,
 *    which is the main CSRF vector. This supplements, and does not replace, the
 *    same-origin check the mutation routes already perform.
 *  - `secure` is set whenever the app is not being served over plain loopback, so
 *    a deployment cannot accidentally send the token in the clear. It is left off
 *    for loopback because `next dev` runs over http and a `secure` cookie would
 *    simply never be stored there.
 *  - `path: "/"` so the whole app can see it, and `maxAge` matching the server's
 *    own expiry so the browser forgets it at about the same time the row does.
 */
import { cookies } from "next/headers";

import {
  resolveSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  type SessionUser,
} from "@/lib/auth/session";

function useSecureCookie(): boolean {
  const explicit = process.env.SESSION_COOKIE_SECURE;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  const origin = process.env.APP_ORIGIN ?? process.env.NEXTAUTH_URL ?? "";
  if (origin.startsWith("https://")) return true;
  // Default to secure unless we are plainly on loopback development.
  return !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookie(),
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // Revoke server-side first is the caller's job; this only clears the browser.
  store.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** The signed-in user, or null. Never throws, so pages can render either way. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await readSessionToken();
  return resolveSession(token);
}

/**
 * Ends the session in the database and clears the cookie. Both steps matter: the
 * cookie alone would leave a usable token in any copy already taken.
 */
export async function signOut(): Promise<void> {
  const token = await readSessionToken();
  revokeSession(token);
  await clearSessionCookie();
}
