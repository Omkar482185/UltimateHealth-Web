import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * Why each one is here, and what is deliberately absent:
 *
 *  - `X-Content-Type-Options: nosniff` stops a browser from re-interpreting a
 *    response as a type it was not served as. This application serves JSON that
 *    contains user-entered text back to the browser, so a sniffed content type is
 *    a real path to script execution.
 *  - `Referrer-Policy: strict-origin-when-cross-origin` means that following a
 *    source link out of the library sends the publisher only the origin, not the
 *    path. The path is a document slug, and whether a reader looked at a
 *    chikungunya page is not something a third party needs to learn.
 *  - `Permissions-Policy` denies camera and microphone outright, because nothing
 *    here uses either. Geolocation is narrowed to this origin rather than denied,
 *    because location is intended to be used later for healthcare discovery behind
 *    an explicit permission prompt; leaving it open to every origin would be the
 *    mistake, and denying it here would only have to be undone.
 *  - `X-Frame-Options: SAMEORIGIN` blocks a cross-origin page from framing this
 *    one. Same-origin framing is allowed on purpose: the development preview panel
 *    embeds the loopback dev server, and `DENY` would break that workflow.
 *
 * What is not here: a Content-Security-Policy. Next.js serves inline bootstrap
 * scripts, so a meaningful policy needs per-request nonces rather than a static
 * header, and a wrong one breaks the application in ways that are easy to miss. A
 * deployment should set `Content-Security-Policy` and add `Strict-Transport-
 * Security` at its proxy, where the origin and TLS termination are known. That
 * requirement is recorded in `docs/architecture.md` rather than guessed at here.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
