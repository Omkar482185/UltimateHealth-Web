# Peer community

The disease community is one implementation with per-disease metadata, not a page
per condition. It is separate from the medical corpus and from personal health
records.

## Routes

| Route | Purpose |
| --- | --- |
| `/community` | Hub: discovery, followed communities, unanswered questions, discussions marked helpful, disease and search filters |
| `/community/[disease]` | Reusable disease template: introduction, topics, composer, feed, unanswered questions, sourced information, external support, guidelines |
| `/community/[disease]/[postId]` | Thread: post, helpful marks, report control, author edit/delete, comments and one level of replies |
| `/community/guidelines` | Community rules, reporting and moderation, privacy, emergency boundary |
| `/community/moderation` | Restricted report queue; only accounts on the server allowlist can read or act on it |

Disease metadata lives in `lib/community/diseases.ts`: introduction, purpose,
discussion topics, corpus topic, information page, external resource ids, and a
starter question. Adding a disease means adding one entry there (and its external
resources), not another route.

## Data and authorisation

Tables are created by `lib/db/schema.ts`: `community_posts`, `community_comments`,
`community_reactions`, `community_reports`, `community_follows`.

- The author is always the session account. No endpoint accepts a user id.
- Editing and deleting are scoped in SQL to `author_id`; a moderator cannot edit
  someone else's wording. Removal is soft so a report keeps a target.
- A helpful mark is a primary key `(user_id, post_id)`, so a second reaction
  cannot inflate a count. The endpoint toggles it.
- Display names come from the profile display name or a generated pseudonym
  derived from the account id. Email addresses and health profile fields are
  never selected into a community query.
- Following a community is explicit, stored separately from the profile, and only
  changes feed ordering. It is not a diagnosis and is never inferred.
- Community content is not added to `documents`, retrieval, or the assistant.
- Account deletion cascades to posts and comments.

Moderation is enabled by server configuration:

```sh
COMMUNITY_MODERATOR_EMAILS=moderator@example.org,second@example.org
```

When unset, nobody can moderate and the queue is closed. There is no profile flag
or self-service grant. Opening a report in the queue is checked again by the API
on every action.

## External communities

`lib/community/external.ts` is the reviewed directory. Each entry records the
canonical URL, the date it was opened, what activity was visible, access limits,
and why it may be useful. `VERIFIED_ON` is the date shown on the page.

Verified on **20 October 2026**:

| Resource | Kind | Canonical URL | Finding |
| --- | --- | --- | --- |
| HealthCircle — Chikungunya Support | Peer community, dedicated to chikungunya | https://healthcircle.life/community/chikungunya | Readable without signing in. Displayed 2 members and 1 discussion. New and very small; joining/posting needs an account. |
| PatientsLikeMe — Chikungunya infection | Condition page, not an active discussion group | https://www.patientslikeme.com/conditions/chikungunya-infection | Displayed 5 members reporting the condition. Public page readable; participation needs an account. No public discussion activity could be established. |
| WHO — Chikungunya | Medical information | https://www.who.int/health-topics/chikungunya | Reference page, explicitly not a patient community. |
| Endometriosis UK — Support groups | Peer community / support-group network | https://www.endometriosis-uk.org/support-groups | Directory listed local groups in England, Scotland, Wales and Northern Ireland, plus online and private Facebook groups. Joining uses a group mailing list; read the directory without an account. |
| PDMDS India — Parkinson's Disease and Movement Disorder Society | Patient organisation | https://www.parkinsonssocietyindia.com/ | Public site describes support and rehabilitation, caregiver information, and support centres across Indian states. Not an online discussion forum; individual centre activity was not verified. |
| Kidney Care UK — Help and support | Support service | https://kidneycareuk.org/get-support/ | UK kidney patient charity offering a support line, counselling, advocacy, grants, and CKD information. A support service, not a peer forum. |
| HealthUnlocked | Not listed | https://healthunlocked.com/ | Returned HTTP 403 to a direct read, so the community pages and their activity could not be verified. Nothing is listed until they can be checked. |

Platform-level reasons for a candidate not being listed are kept in
`PLATFORM_FINDINGS` in the same file, next to the directory.

No dedicated chikungunya community was invented, and no generic infection,
arthritis, or chronic-pain group is presented as a chikungunya community. The
dedicated page is new and very small, and the page says so rather than describing
it as established.

Maintenance:

1. Open the canonical URL yourself and read the community page.
2. Update `checkedOn` and the activity note to what is actually visible.
3. Never add member counts, testimonials, or activity claims you did not see.
4. Remove a resource that no longer exists rather than leaving a dead link.
5. Do not scrape posts, mirror content, embed a feed, or create accounts on
   another platform. These are ordinary outbound links.

## Patient-experience discovery

The same section (`#experiences`, rendered by
`components/community/ExperienceExplorer.tsx`) is on the hub and on every disease
page. It is not a new route or tab. It offers two clearly separate paths:

1. **Ask people and connect** — a draft question with copy-to-clipboard, the
   native composer link, and the verified external destinations for the selected
   disease. Nothing is posted on the reader's behalf, and the interface says that
   it cannot post, sign in, or confirm a reply elsewhere.
2. **Read patient experiences** — searches discussions stored by UltimateHealth
   and, separately, public questions from Medical Sciences Stack Exchange.

`POST /api/community/discover` with `{ disease, q, topic, includeExternal }`
returns `native`, `external`, and `fallbacks` as separate fields. The section calls
it automatically on open with `includeExternal: true`, so opening a disease
community shows stored discussions **and** attempts external discovery without
making the reader type a query first. `includeExternal: false` remains the
explicit opt-out for callers that want stored discussions only. The repetition is
bounded rather than free: the provider answer is cached per disease and query for
ten minutes server-side, concurrent identical searches share one in-flight
request, and a failed provider is backed off for sixty seconds. Opening a
community is therefore at most one provider round trip (two search calls plus one
answer lookup), and none at all inside the cache window. A reader can also retry
external discovery explicitly from the unavailable notice. When the provider returns answers, the accepted answer
(or the highest-voted one) is shown with its author, score and date in a single
additional authorised request for at most three questions. It is a POST because the body
carries the reader's question: in a query string a health question would be
written to access logs and browser history before any other consideration. The
endpoint refuses cross-origin requests, validates the disease id against
`lib/community/diseases.ts`, refuses unknown topics, caps the question at 200
characters, rate-limits the caller, and answers `no-store`. Native results come
from the existing `listPosts` search; no new search infrastructure was added.

Experience categories live in `lib/community/experience-topics.ts` and map the
per-disease topic ids (for example `joints`, `newly-diagnosed`, `carers`) to one
shared vocabulary. A unit check asserts that every configured disease topic maps
to a category, so a new topic cannot silently vanish from the filter.

### External search: what was verified

Checked 20–21 October 2026. Capabilities are also in `PROVIDER_FINDINGS` in
`lib/community/experience-search.ts` and shown in a disclosure on the page.

| Provider | Method | What was established |
| --- | --- | --- |
| Medical Sciences Stack Exchange | Official public API v2.3, `search/advanced` | Answered with JSON without a key, within the anonymous quota. Public contributions are CC BY-SA, so a short attributed excerpt plus a link to the original question is permitted. **Implemented as search.** |
| Reddit | Official API via OAuth | The unauthenticated search endpoint returned HTTP 403 from this deployment. No credentials are configured, so no Reddit search is performed. |
| HealthUnlocked | Direct read | HTTP 403. Not listed, because neither the groups nor their activity could be verified. |
| PatientsLikeMe | Direct link | Public condition page readable; no public discussion search interface found. Linked only. |
| HealthCircle | Direct link | Dedicated chikungunya page readable; no public search interface verified. Linked only. |

Search behaviour, all of it bounded:

- **Two requests at most** per search: the question-specific query, then the
  condition alone if fewer than three relevant results came back. Results from the
  broader query are filtered to those that actually mention the condition.
- **Timeout** of 7 seconds per request; a timeout returns `unavailable`.
- **Cache** of 10 minutes per disease and query (60 entries maximum), in process
  memory. The response marks a cached answer, and the page shows the retrieval
  time. A cache is per server instance, not shared across a deployment.
- **Backoff** of 60 seconds after a failure or a provider `backoff` field, so a
  failing service is not called in a loop.
- **URL allowlist**: a result is shown only when its link is `https` on
  `medicalsciences.stackexchange.com` with no embedded credentials. This is
  checked again in the unit tests. The link is the original question; the card
  never substitutes a homepage for a discussion.
- **Excerpt only**: the plain text of the question body, markup stripped, capped
  at 260 characters, with the author, date, tags, source, licence (`CC BY-SA`),
  licence link and retrieval time. Nothing is written to the UltimateHealth
  database.
- **Privacy**: the condition name alone is sent when a community opens, and the
  typed question is added only when the reader submits the search; the form says
  so. No account, profile, or health record is ever included. The emergency rule is unchanged: the
  assistant's screening is not involved, and the community page repeats that
  urgent symptoms need urgent care rather than a thread.

When the provider is unavailable the response is `status: "unavailable"` with a
reader-facing reason, and the page shows the verified destination list instead.
When nothing matches it is `empty` with an explanation that no match is not
evidence that nobody has the experience. Neither state is rendered as a successful
result, and no placeholder content is generated.

### What is not stored or claimed

- No external post, author profile, or activity feed is copied into the database.
- No member counts, testimonials, or "people are talking about this" claims are
  generated. Counts shown are the rows actually stored.
- A story is always labelled as one person's account, never as verified medical
  information or as evidence that a treatment works.
- External results are labelled **general medical questions and answers**, not as
  first-person patient or caregiver experiences and not as reviewed content. The
  provider is a Q&A site: most threads are clinical questions and replies, so
  describing them as lived experience would be false. The page states this next to
  the heading and again under the results.
- **No authorised feed of individual patient stories is integrated.** Reddit needs
  OAuth credentials that are not configured, and HealthUnlocked returned HTTP 403,
  so neither could be verified or searched. The verified communities are presented
  as destinations a reader can visit and post in themselves — never mirrored,
  scraped, or summarised as if they were UltimateHealth content.
- Reporting an external question is done on the source site, using its own flag or
  report control; the page says so. Native posts keep the existing report control,
  which reaches the moderator queue.

## Safety boundaries in the interface

- Disease pages distinguish peer experiences, sourced medical information, and
  the assistant.
- Every thread says the post is one person's account, not verified medical
  information.
- Emergency guidance is on the hub, disease page, thread, and guidelines page;
  the community is explicitly not an emergency service.
- Reporting offers harassment, spam, personal information, unsafe medical advice,
  and other. The API refuses self-reports and duplicate reports.
- Contact details in posts and replies are refused by a small, explainable rule,
  and the composer tells the author which rule refused it.
- Text is rendered as text, never as markup.

## Missing pages in production

`pnpm dev` answers a `notFound()` with HTTP 404. A `next start` build of this app
has `cacheComponents` enabled, so each page is a prerendered shell with the
request-time content streamed into it; the status line is sent with the shell, and
it cannot be revised when the page body later decides the discussion is gone. In
that build an unknown disease, a removed post, and a deleted post are therefore
served as `200` carrying Next's not-found document, which is marked `noindex`. The
removed text is never in that response, and the feed never lists it; only the
status line differs. A deployment that needs a hard 404 at the edge should add a
pre-stream check (a `proxy.ts` slug check, or a rewrite at the CDN), because
checking after streaming has begun cannot change the code already sent.

## Tests

```sh
pnpm dev   # with COMMUNITY_MODERATOR_EMAILS set for the moderation checks
pnpm check:community
```

`scripts/check-community.mjs` creates two throwaway accounts, exercises
authorisation, validation, persistence, reactions, replies, edits, deletion,
search, filters, follows, reporting, moderation, escaping, and external labels,
then deletes the accounts. It also exercises `POST /api/community/discover`:
invalid disease and topic ids, a missing body, a cross-origin refusal, the
rejection of a GET, native results with their real topic and URL, the
experience-topic filter, and the external result contract (an explicit status,
`https` URLs on the provider's own host, unique ids, plain-text excerpts, source
and licence). It exits 2 if the sign-up limiter prevents the run, so a blocked run
is not reported as a pass. Restart the development server between repeated runs,
because the in-process sign-up limiter counts every attempt.

Pure rules are covered in `scripts/verify-unit.ts`: query construction, entity
decoding and excerpt stripping, the result-host allowlist, the outbound-url rules,
and the guarantee that every disease topic maps to an experience category.
