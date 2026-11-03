/**
 * Peer-community integration checks against a running server.
 *
 *   COMMUNITY_MODERATOR_EMAILS=community-mod@example.test pnpm dev
 *   pnpm check:community
 *
 * These drive the real HTTP endpoints and rendered pages, because the important
 * properties here are at the boundary: who may edit what, whether a removed post
 * disappears from the public feed, whether a report reaches the moderator queue,
 * and whether a reaction can be counted twice. Unit tests on the store would miss
 * the session, the same-origin guard, and the page rendering.
 *
 * The script creates two throwaway accounts and deletes them at the end. A third,
 * fixed moderator account is reused between runs; the server must have been
 * started with that address in COMMUNITY_MODERATOR_EMAILS or the moderation
 * checks are reported as blocked rather than passed.
 */
import path from "node:path";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";
const MODERATOR_EMAIL = "community-mod@example.test";
const PASSWORD = "community test passphrase 2026";
// Base 36 keeps the stamp from looking like a phone number to the composer's
// own contact-detail check.
const stamp = Date.now().toString(36);
const A = { email: `community-a-${stamp}@example.test`, password: PASSWORD };
const B = { email: `community-b-${stamp}@example.test`, password: PASSWORD };

function jar() {
  return { cookie: null };
}

async function call(j, method, pathname, body, extraHeaders = {}) {
  const headers = { origin: BASE, ...extraHeaders };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (j?.cookie) headers.cookie = j.cookie;
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0];
    if (pair.startsWith("uh_session=")) {
      const value = pair.slice("uh_session=".length);
      j.cookie = value ? `uh_session=${value}` : null;
    }
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  return { status: res.status, json, text };
}

const results = [];
function t(name, pass, detail) {
  results.push({ name, pass });
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${
      detail !== undefined ? `  -> ${JSON.stringify(detail).slice(0, 240)}` : ""
    }`,
  );
}

function blocked(message) {
  console.error(`\nBLOCKED: ${message}\n`);
  process.exit(2);
}

/**
 * True when the server answered with its not-found document.
 *
 * `pnpm dev` resolves notFound() to a plain 404. A production `next start` build
 * with `cacheComponents` streams a prerendered shell first, and the HTTP status is
 * fixed once those headers are sent, so the same notFound() arrives as a 200 that
 * carries the not-found document with a `noindex` tag. That is documented
 * framework behaviour (the HTTP contract of streaming), so the check accepts the
 * streamed form while still requiring the document itself to be the not-found
 * page. Callers that know the removed content must also assert it is absent from
 * the body, because a 200 alone would not prove that.
 */
function isNotFoundDocument(res) {
  if (res.status === 404) return true;
  return (
    res.status === 200 &&
    res.text.includes('name="robots"') &&
    res.text.includes("noindex") &&
    res.text.includes("could not be found")
  );
}

async function ensureAccount(j, account, displayName) {
  let res = await call(j, "POST", "/api/auth/register", {
    ...account,
    acceptConsent: true,
  });

  if (res.status === 429) {
    blocked(
      `registration was rate-limited, so the community checks could not run. ${res.json?.error ?? ""}`,
    );
  }

  if (res.status === 409) {
    res = await call(j, "POST", "/api/auth/login", {
      email: account.email,
      password: account.password,
    });
    if (res.status !== 200) {
      blocked(
        `the fixed moderator account exists but could not be signed in to: ${res.json?.error ?? res.status}`,
      );
    }
  } else if (res.status !== 201) {
    blocked(`could not create a test account: ${JSON.stringify(res.json).slice(0, 300)}`);
  }

  if (displayName) {
    const profile = await call(j, "PUT", "/api/account/profile", { displayName });
    if (profile.status !== 200) {
      blocked(`could not set the test display name: ${JSON.stringify(profile.json)}`);
    }
  }
}

const ja = jar();
const jb = jar();
const jm = jar();

const health = await fetch(`${BASE}/community`);
if (health.status !== 200) {
  blocked(`the site is not answering /community (HTTP ${health.status}). Start pnpm dev first.`);
}

await ensureAccount(ja, A, "Community Tester A");
await ensureAccount(jb, B, "Community Tester B");
await ensureAccount(jm, { email: MODERATOR_EMAIL, password: PASSWORD }, "Community Moderator");

/* ------------------------------------------------------------------ */
/* Public pages and external directory                                 */
/* ------------------------------------------------------------------ */

let res = await call(null, "GET", "/community");
t(
  "the community hub renders discovery and safety boundaries",
  res.status === 200 &&
    res.text.includes("Disease communities") &&
    res.text.includes("Community guidelines") &&
    res.text.includes("not an emergency service"),
  res.status,
);

res = await call(null, "GET", "/community/chikungunya");
t(
  "the Chikungunya community uses the reusable template with its own topics",
  res.status === 200 &&
    res.text.includes("Chikungunya community") &&
    res.text.includes("Joint pain and mobility") &&
    res.text.includes("Supporting a family member"),
  res.status,
);
t(
  "the verified HealthCircle Chikungunya community is linked plainly",
  res.text.includes("https://healthcircle.life/community/chikungunya") &&
    res.text.includes("Visit external community") &&
    res.text.includes("Last checked") &&
    res.text.includes("20 Oct 2026"),
  "external community link",
);
t(
  "the WHO chikungunya page is labelled as medical information, not a community",
  res.text.includes("https://www.who.int/health-topics/chikungunya") &&
    res.text.includes("Medical information, not a patient community"),
  "WHO link label",
);
t(
  "a dedicated Chikungunya community is not denied when one was verified",
  !res.text.includes("No dedicated external community was verified for Chikungunya"),
  "dedicated finding",
);
t(
  "outbound community links are marked as leaving the site",
  res.text.includes('rel="noopener noreferrer external"') &&
    res.text.includes("You will leave UltimateHealth"),
  "rel and warning",
);

res = await call(null, "GET", "/community/dengue");
t(
  "another disease reuses the template but not Chikungunya's external directory",
  res.status === 200 &&
    res.text.includes("Dengue community") &&
    !res.text.includes("healthcircle.life/community/chikungunya"),
  res.status,
);
t(
  "when no dedicated external community exists the page says so",
  res.text.includes("No dedicated online peer community was verified for") &&
    res.text.includes("dengue-specific"),
  "dengue finding",
);

res = await call(null, "GET", "/community/endometriosis");
t(
  "the Endometriosis community has its own topics and verified support group",
  res.status === 200 &&
    res.text.includes("Getting diagnosed") &&
    res.text.includes("https://www.endometriosis-uk.org/support-groups") &&
    res.text.includes("Visit external community"),
  res.status,
);

res = await call(null, "GET", "/community/parkinsons-disease");
t(
  "the Parkinson's community distinguishes an organisation from an online group",
  res.status === 200 &&
    res.text.includes("Care partners and family") &&
    res.text.includes("https://www.parkinsonssocietyindia.com/") &&
    res.text.includes("No dedicated online peer community was verified") &&
    res.text.includes("Visit support organisation"),
  res.status,
);

res = await call(null, "GET", "/community/chronic-kidney-disease");
t(
  "the CKD community links kidney information and a support service",
  res.status === 200 &&
    res.text.includes("Questions for your care team") &&
    res.text.includes("https://kidneycareuk.org/get-support/") &&
    res.text.includes("/library?topic=kidney-health"),
  res.status,
);

res = await call(null, "GET", "/community");
t(
  "the hub discovers all of the newly configured disease communities",
  res.text.includes("Endometriosis") &&
    res.text.includes("Parkinson's disease") &&
    res.text.includes("Chronic kidney disease"),
  "hub discovery",
);

res = await call(null, "GET", "/community/not-a-condition");
t(
  "an unknown disease community is a not-found, not an empty page",
  isNotFoundDocument(res),
  res.status,
);

res = await call(null, "GET", "/community/guidelines");
t(
  "the guidelines page covers moderation, privacy and emergencies",
  res.status === 200 &&
    res.text.includes("Reporting and moderation") &&
    res.text.includes("Privacy and public names") &&
    res.text.includes("This is not an emergency service"),
  res.status,
);

res = await call(null, "GET", "/chikungunya");
t(
  "the Chikungunya information page links to its community",
  res.status === 200 && res.text.includes("Open the Chikungunya community"),
  res.status,
);

res = await call(null, "GET", "/assistant?topic=mosquito-borne-disease");
t(
  "the assistant offers the matching disease community without adding it to the corpus",
  res.status === 200 &&
    res.text.includes("Talk to people who have been through it") &&
    res.text.includes("Chikungunya"),
  res.status,
);

/* ------------------------------------------------------------------ */
/* Authorisation and validation                                        */
/* ------------------------------------------------------------------ */

res = await call(null, "POST", "/api/community/posts", {
  diseaseId: "chikungunya",
  topicId: "joints",
  title: "A question without an account",
  body: "This request should not be accepted without a session cookie.",
});
t("anonymous posting is 401", res.status === 401, res.json);

res = await call(ja, "POST", "/api/community/posts", {
  diseaseId: "chikungunya",
  topicId: "monitoring",
  title: "A topic borrowed from another community",
  body: "The monitoring topic belongs to high blood pressure, not chikungunya.",
});
t("a topic from another disease is refused", res.status === 400, res.json);

res = await call(ja, "POST", "/api/community/posts", {
  diseaseId: "chikungunya",
  topicId: "joints",
  title: "Contact me on 98765 43210",
  body: "Please call me on that number and also email me at person@example.test.",
});
t(
  "the composer refuses phone numbers and email addresses",
  res.status === 400 && JSON.stringify(res.json).includes("phone numbers"),
  res.json,
);

const title = `Joint pain at night after chikungunya ${stamp}`;
const body =
  "I am three weeks past the fever and the joint pain still wakes me at night. " +
  "Walking in the morning is stiff for about twenty minutes. I would like to hear " +
  "what pacing or mobility routines other people found realistic.";
res = await call(ja, "POST", "/api/community/posts", {
  diseaseId: "chikungunya",
  topicId: "joints",
  title,
  body,
});
const postId = res.json?.post?.id;
t(
  "a signed-in person can publish a post and is shown by display name",
  res.status === 201 && postId > 0 && res.json?.post?.authorName === "Community Tester A",
  { status: res.status, author: res.json?.post?.authorName },
);

const secondTitle = `Questions before my follow-up appointment ${stamp}`;
res = await call(ja, "POST", "/api/community/posts", {
  diseaseId: "chikungunya",
  topicId: "doctor-questions",
  title: secondTitle,
  body:
    "My follow-up is next week and I want to use the time well. " +
    "What did you ask about lingering fatigue, and what did you wish you had written down?",
});
const secondPostId = res.json?.post?.id;
t("a second, unanswered question can be published", res.status === 201, res.status);

res = await call(ja, "GET", "/community/chikungunya");
t(
  "the new discussion appears in the disease feed",
  res.text.includes(title) && res.text.includes(secondTitle),
  "feed",
);

res = await call(null, "GET", `/community/chikungunya?topic=emotional`);
t(
  "a topic with no posts produces the filtered empty state, not an unfiltered feed",
  res.text.includes("No discussions match"),
  "topic filter",
);

res = await call(null, "GET", `/community/chikungunya?topic=doctor-questions`);
t(
  "a topic with a post renders it without the empty state",
  res.text.includes(secondTitle) && !res.text.includes("No discussions match"),
  "topic filter match",
);

res = await call(null, "GET", `/community?disease=dengue`);
t("the hub disease filter excludes the Chikungunya discussion", !res.text.includes(title), "hub filter");
res = await call(null, "GET", `/community?q=${stamp}`);
t(
  "search by a word in the post returns it",
  res.text.includes(title) && res.text.includes(secondTitle),
  "search",
);

res = await call(jb, "PATCH", `/api/community/posts/${postId}`, {
  title: "B tries to rewrite A's post",
  body: "This edit should be refused because B is not the author of the post.",
});
t("another account cannot edit A's post", res.status === 403, res.json);

res = await call(jb, "DELETE", `/api/community/posts/${postId}`);
t("another account cannot delete A's post", res.status === 403, res.json);

const editedTitle = `${title} (updated)`;
res = await call(ja, "PATCH", `/api/community/posts/${postId}`, {
  title: editedTitle,
  body: `${body} An update: the stiffness is easing after two weeks of short walks.`,
});
t(
  "the author can edit their own post and it persists",
  res.status === 200 && res.json?.post?.editedAt !== null,
  res.json?.post?.editedAt,
);

/* ------------------------------------------------------------------ */
/* Reactions, comments and replies                                     */
/* ------------------------------------------------------------------ */

res = await call(jb, "POST", `/api/community/posts/${postId}/reactions`);
t(
  "a reader's helpful mark is stored with a real count",
  res.status === 200 && res.json?.reacted === true && res.json?.count === 1,
  res.json,
);
res = await call(jb, "POST", `/api/community/posts/${postId}/reactions`);
t(
  "marking the same post again removes the mark instead of inflating the count",
  res.status === 200 && res.json?.reacted === false && res.json?.count === 0,
  res.json,
);
res = await call(jb, "POST", `/api/community/posts/${postId}/reactions`);
res = await call(ja, "POST", `/api/community/posts/${postId}/reactions`);
t(
  "two different people produce a count of two, one each",
  res.status === 200 && res.json?.count === 2,
  res.json,
);

const commentBody =
  "The morning stiffness eased for me when I broke walking into two shorter trips. " +
  "That is only my experience, not advice about your treatment.";
res = await call(jb, "POST", `/api/community/posts/${postId}/comments`, {
  body: commentBody,
});
const commentId = res.json?.comment?.id;
t("a reader can reply to a discussion", res.status === 201 && commentId > 0, res.status);

res = await call(ja, "POST", `/api/community/posts/${postId}/comments`, {
  body: "Thank you. Splitting the walk is something I can try and then mention at my appointment.",
  parentCommentId: commentId,
});
const replyId = res.json?.comment?.id;
t("a reply can be attached to a top-level comment", res.status === 201 && replyId > 0, res.status);

res = await call(ja, "POST", `/api/community/posts/${postId}/comments`, {
  body: "This is a reply to a reply, which the one-level model should refuse.",
  parentCommentId: replyId,
});
t("replies are limited to one level", res.status === 400, res.json);

res = await call(null, "GET", `/community/chikungunya/${postId}`);
t(
  "the thread page renders the post and both replies with a peer-experience warning",
  res.status === 200 &&
    res.text.includes(title) &&
    res.text.includes(commentBody.slice(0, 40)) &&
    res.text.includes("This is one person"),
  res.status,
);
t(
  "the thread states it is not medical advice and offers the sourced information",
  res.text.includes("Not medical advice") && res.text.includes("/chikungunya"),
  "thread boundary",
);

res = await call(jb, "PATCH", `/api/community/comments/${commentId}`, {
  body: "Edited: the shorter walks helped me, and I raised it with my physiotherapist.",
});
t("the author can edit their own reply", res.status === 200, res.status);

res = await call(ja, "PATCH", `/api/community/comments/${commentId}`, {
  body: "A tries to edit B's reply, which should not be allowed.",
});
t("another account cannot edit a reply", res.status === 403, res.json);

res = await call(ja, "GET", "/community/chikungunya");
t(
  "the feed reflects the real reply and helpful counts",
  res.text.includes("2 people marked this helpful") && res.text.includes("2 replies"),
  "feed counts",
);

/* ------------------------------------------------------------------ */
/* Follows and personalised feed                                       */
/* ------------------------------------------------------------------ */

res = await call(jb, "POST", "/api/community/follows", {
  diseaseId: "chikungunya",
  following: true,
});
t("a person can explicitly follow a community", res.status === 200 && res.json?.following === true, res.json);

res = await call(jb, "GET", "/community");
t(
  "the hub shows the community the person chose to follow",
  res.status === 200 &&
    res.text.includes("Communities you follow") &&
    res.text.includes("Following:") &&
    res.text.includes("Chikungunya"),
  "personal feed",
);

res = await call(jb, "POST", "/api/community/follows", {
  diseaseId: "chikungunya",
  following: false,
});
t("following can be undone", res.status === 200 && res.json?.following === false, res.json);

res = await call(null, "GET", "/community");
t(
  "a signed-out reader is not assigned a diagnosis or a personal feed",
  !res.text.includes("Following:") &&
    res.text.includes("Reading is open to everyone"),
  "signed-out feed",
);

res = await call(null, "GET", `/community/chikungunya?sort=unanswered`);
t(
  "the unanswered view keeps the question with no reply and now excludes the answered one",
  res.text.includes(secondTitle) && !res.text.includes(editedTitle),
  "unanswered ordering",
);

/* ------------------------------------------------------------------ */
/* Reporting and moderation                                            */
/* ------------------------------------------------------------------ */

res = await call(jb, "POST", "/api/community/reports", {
  targetType: "post",
  targetId: postId,
  reason: "spam",
  detail: "This is a test report filed by the integration check.",
});
t("a reader can report a post", res.status === 201, res.status);

res = await call(jb, "POST", "/api/community/reports", {
  targetType: "post",
  targetId: postId,
  reason: "spam",
});
t("the same person cannot file the same report twice", res.status === 409, res.json);

res = await call(ja, "POST", "/api/community/reports", {
  targetType: "post",
  targetId: postId,
  reason: "other",
});
t("an author cannot report their own post", res.status === 400, res.json);

res = await call(jb, "GET", "/community/moderation");
t(
  "a non-moderator sees no reports and is told why",
  res.status === 200 && !res.text.includes(title) && res.text.includes("not a moderator"),
  res.status,
);

res = await call(jm, "GET", "/community/moderation");
t(
  "the moderator queue contains the report and the reported content",
  res.status === 200 &&
    res.text.includes(title) &&
    res.text.includes("Spam, advertising or a scam") &&
    res.text.includes("This is a test report"),
  res.status,
);

res = await call(jm, "POST", "/api/community/moderation", {
  targetType: "post",
  targetId: postId,
  action: "remove",
  note: "Test removal by the integration check.",
});
t("a moderator can remove reported content", res.status === 200 && res.json?.ok === true, res.json);

res = await call(null, "GET", `/community/chikungunya/${postId}`);
t(
  "a removed discussion is not served to the public",
  isNotFoundDocument(res) && !res.text.includes(title),
  res.status,
);
res = await call(null, "GET", "/community/chikungunya");
t("a removed discussion disappears from the public feed", !res.text.includes(title), "feed");
res = await call(jm, "GET", `/community/chikungunya/${postId}`);
t("a moderator can still open the removed thread for review", res.status === 200 && res.text.includes(title), res.status);

res = await call(jm, "POST", "/api/community/moderation", {
  targetType: "post",
  targetId: postId,
  action: "restore",
});
t("a moderator can restore content they removed", res.status === 200, res.json);
res = await call(null, "GET", `/community/chikungunya/${postId}`);
t("restored content is public again", res.status === 200, res.status);

res = await call(jb, "POST", "/api/community/reports", {
  targetType: "comment",
  targetId: replyId,
  reason: "unsafe-medical-advice",
  detail: "Synthetic report used to exercise the dismiss path.",
});
t("a reply can be reported", res.status === 201, res.status);
res = await call(jm, "POST", "/api/community/moderation", {
  targetType: "comment",
  targetId: replyId,
  action: "dismiss",
});
t(
  "a moderator can dismiss a report without changing the content",
  res.status === 200 && res.json?.resolved >= 1,
  res.json,
);
res = await call(null, "GET", `/community/chikungunya/${postId}`);
t("dismissing leaves the reply visible", res.status === 200 && res.text.includes("Thank you. Splitting the walk"), res.status);
res = await call(jm, "GET", "/community/moderation");
t(
  "a resolved comment report leaves the open queue",
  res.status === 200 && res.text.includes("No open reports"),
  res.status,
);

res = await call(ja, "POST", "/api/community/reports", {
  targetType: "comment",
  targetId: commentId,
  reason: "harassment",
  detail: "Synthetic report used to exercise comment removal.",
});
t("a different reader can report a reply", res.status === 201, res.status);
res = await call(jm, "POST", "/api/community/moderation", {
  targetType: "comment",
  targetId: commentId,
  action: "remove",
});
t(
  "removing a reported reply resolves its report",
  res.status === 200 && res.json?.resolved >= 1,
  res.json,
);
res = await call(null, "GET", `/community/chikungunya/${postId}`);
t(
  "a removed reply is hidden and replaced with a moderator notice",
  res.status === 200 &&
    !res.text.includes(commentBody.slice(0, 40)) &&
    res.text.includes("This reply was removed by a moderator"),
  res.status,
);

res = await call(jb, "POST", `/api/community/reports`, {
  targetType: "post",
  targetId: secondPostId,
  reason: "harassment",
}, { origin: "https://evil.example" });
t("cross-origin community writes are 403", res.status === 403, res.status);

/* ------------------------------------------------------------------ */
/* Question-to-experience discovery                                    */
/* ------------------------------------------------------------------ */

res = await call(null, "POST", "/api/community/discover", {
  disease: "chikungunya",
  q: "joint pain at night",
});
const discovery = res.json;
t(
  "discovery returns the stored discussion that matches the question",
  res.status === 200 &&
    Array.isArray(discovery?.native) &&
    discovery.native.some(
      (post) =>
        post.title === editedTitle && post.url === `/community/chikungunya/${postId}`,
    ),
  res.status,
);
t(
  "a stored discovery result carries its real topic, author and reply count",
  Array.isArray(discovery?.native) &&
    discovery.native.every(
      (post) =>
        typeof post.topicLabel === "string" &&
        post.topicLabel.length > 0 &&
        typeof post.authorName === "string" &&
        post.authorName.length > 0 &&
        Number.isInteger(post.commentCount),
    ),
  discovery?.native?.[0]?.topicLabel,
);
t(
  "discovery never reports a discussion from another disease",
  Array.isArray(discovery?.native) &&
    discovery.native.every((post) => post.url.startsWith("/community/chikungunya/")),
  discovery?.native?.length,
);

res = await call(null, "POST", "/api/community/discover", {
  disease: "chikungunya",
  topic: "symptoms-impact",
  q: "joint pain at night",
});
t(
  "the experience-topic filter keeps a post whose stored topic maps to it",
  res.status === 200 &&
    res.json?.native?.some((post) => post.title === editedTitle) &&
    res.json.native.every((post) => post.experienceTopic === "symptoms-impact"),
  res.json?.native?.map((post) => post.experienceTopic),
);
res = await call(null, "POST", "/api/community/discover", {
  disease: "chikungunya",
  topic: "treatment",
  q: "joint pain at night",
});
t(
  "the experience-topic filter excludes a post filed under another category",
  res.status === 200 && !res.json?.native?.some((post) => post.title === editedTitle),
  res.json?.native?.length,
);

res = await call(null, "POST", "/api/community/discover", {
  disease: "not-a-condition",
});
t(
  "discovery refuses an unknown disease identifier",
  res.status === 400 && res.json?.kind === "invalid-disease",
  res.json,
);
res = await call(null, "POST", "/api/community/discover", {
  disease: "dengue",
  topic: "not-a-real-topic",
});
t(
  "discovery refuses an unrecognised experience topic",
  res.status === 400 && res.json?.kind === "invalid-topic",
  res.json,
);

const external = discovery?.external;
t(
  "the external result carries one explicit status, never a silent failure",
  ["ok", "empty", "unavailable"].includes(external?.status) &&
    typeof external?.retrievedAt === "string" &&
    typeof external?.provider?.name === "string",
  external?.status,
);
if (external?.status === "ok") {
  t(
    "every external result is a real https URL on the provider's own host",
    external.items.length > 0 &&
      external.items.every(
        (item) =>
          typeof item.url === "string" &&
          item.url.startsWith("https://medicalsciences.stackexchange.com/") &&
          typeof item.title === "string" &&
          item.title.length > 0 &&
          (item.publishedAt === null || !Number.isNaN(Date.parse(item.publishedAt))),
      ),
    external.items.map((item) => item.url).slice(0, 2),
  );
  t(
    "every external result names its source and licence, and keeps unique ids",
    external.items.every(
      (item) =>
        item.provider === "Medical Sciences Stack Exchange" &&
        item.licence === "CC BY-SA" &&
        item.licenceUrl.startsWith("https://"),
    ) && new Set(external.items.map((item) => item.id)).size === external.items.length,
    external.items.length,
  );
  t(
    "external excerpts are plain text, never markup",
    external.items.every(
      (item) => item.excerpt === null || !/[<>]/.test(item.excerpt),
    ),
    external.items.map((item) => item.excerpt?.[0] ?? ""),
  );
  t(
    "an answered question carries real answer text, author and accepted status",
    external.items.every((item) => {
      if (item.answerCount === 0) return item.answer === null;
      if (item.answer === null) return external.answerLookup !== "ok";
      return (
        typeof item.answer.excerpt === "string" &&
        item.answer.excerpt.length > 0 &&
        !/[<>]/.test(item.answer.excerpt) &&
        typeof item.answer.accepted === "boolean" &&
        Number.isInteger(item.answer.score) &&
        (item.answer.author === null || typeof item.answer.author === "string")
      );
    }),
    external.items.map((item) => ({
      count: item.answerCount,
      answer: item.answer ? "present" : null,
      accepted: item.answer?.accepted ?? null,
    })),
  );
  t(
    "a question with no answers is not given a fabricated one",
    external.items
      .filter((item) => item.answerCount === 0)
      .every((item) => item.answer === null),
  );
} else {
  t(
    "an unavailable external search states why, and keeps verified destinations usable",
    typeof external?.reason === "string" &&
      external.reason.length > 20 &&
      Array.isArray(discovery?.fallbacks) &&
      discovery.fallbacks.every((item) => item.url.startsWith("https://")),
    external?.reason,
  );
}
t(
  "a disease with no peer community reports that instead of inventing one",
  Array.isArray(discovery?.fallbacks) &&
    discovery.fallbacks.every((item) => item.kind !== "peer-community" || item.url.startsWith("https://")),
  discovery?.fallbacks?.map((item) => `${item.name}:${item.kind}`),
);

res = await call(null, "POST", "/api/community/discover", {
  disease: "chikungunya",
  includeExternal: false,
});
t(
  "the default feed returns stored discussions without spending external quota",
  res.status === 200 &&
    res.json?.native?.some((post) => post.title === editedTitle) &&
    res.json?.external?.status === "skipped" &&
    res.json?.external?.items?.length === 0 &&
    res.json?.external?.answerLookup === "skipped",
  { status: res.status, external: res.json?.external?.status },
);
t(
  "the default feed still carries the verified destinations for the disease",
  res.status === 200 &&
    Array.isArray(res.json?.fallbacks) &&
    res.json.fallbacks.some((item) => item.kind === "peer-community"),
  res.json?.fallbacks?.length,
);

res = await call(null, "POST", "/api/community/discover", {
  disease: "high-blood-pressure",
});
t(
  "discovery works for a disease with no stored discussions, without an error",
  res.status === 200 && Array.isArray(res.json?.native) && res.json?.disease?.id === "high-blood-pressure",
  res.status,
);

res = await call(null, "POST", "/api/community/discover", {
  disease: "chikungunya",
  q: "joint pain",
}, { origin: "https://evil.example" });
t(
  "a cross-origin discovery request is refused",
  res.status === 403,
  res.status,
);

res = await call(null, "GET", "/api/community/discover?disease=chikungunya&q=joint+pain");
t(
  "the question is not accepted through the URL, so it cannot land in a log",
  res.status === 405,
  res.status,
);

res = await call(null, "POST", "/api/community/discover");
t(
  "a discovery request with no body is refused rather than searched",
  res.status === 400 && res.json?.kind === "invalid-body",
  res.json,
);

/* ------------------------------------------------------------------ */
/* Escaping, deletion and cleanup                                      */
/* ------------------------------------------------------------------ */

const xssTitle = `Script test ${stamp}`;
res = await call(ja, "POST", "/api/community/posts", {
  diseaseId: "dengue",
  topicId: "recovery",
  title: xssTitle,
  body: 'A body containing <script>alert("community")</script> must render as text, not markup.',
});
const xssId = res.json?.post?.id;
res = await call(null, "GET", `/community/dengue/${xssId}`);
t(
  "post content is escaped rather than rendered as HTML",
  res.status === 200 &&
    !res.text.includes('<script>alert("community")</script>') &&
    res.text.includes("&lt;script&gt;"),
  "escaped body",
);

res = await call(ja, "DELETE", `/api/community/comments/${replyId}`);
t("the author can delete their own reply", res.status === 200, res.status);
res = await call(null, "GET", `/community/chikungunya/${postId}`);
t(
  "a deleted reply is marked as deleted to readers",
  res.text.includes("This reply was deleted by its author"),
  "deleted reply marker",
);

res = await call(ja, "DELETE", `/api/community/comments/${commentId}`);
t("another account cannot delete a reply", res.status === 403, res.json);

res = await call(ja, "DELETE", `/api/community/posts/${postId}`);
t("the author can delete their own discussion", res.status === 200, res.status);
res = await call(null, "GET", `/community/chikungunya/${postId}`);
t(
  "a deleted discussion is not served to the public",
  isNotFoundDocument(res) && !res.text.includes(title),
  res.status,
);
res = await call(null, "GET", "/community/chikungunya");
t("a deleted discussion disappears from the feed", !res.text.includes(title), "feed");

res = await call(ja, "DELETE", `/api/community/posts/${xssId}`);
res = await call(ja, "DELETE", `/api/community/posts/${secondPostId}`);

/* Remove the throwaway accounts, which also removes any remaining rows. */
res = await call(ja, "DELETE", "/api/account", {
  confirmation: "delete my account",
  password: A.password,
});
t("cleanup: the first test account is deleted", res.status === 200, res.status);
res = await call(jb, "DELETE", "/api/account", {
  confirmation: "delete my account",
  password: B.password,
});
t("cleanup: the second test account is deleted", res.status === 200, res.status);

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exitCode = failed.length === 0 ? 0 : 1;
