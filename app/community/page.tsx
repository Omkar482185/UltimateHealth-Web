import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CommunityFeed } from "@/components/community/CommunityFeed";
import { CommunityFilters } from "@/components/community/CommunityFilters";
import { ExperienceExplorer } from "@/components/community/ExperienceExplorer";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  DISEASES,
  getDisease,
  isDiseaseId,
} from "@/lib/community/diseases";
import {
  PROVIDER_FINDINGS,
  verifiedFallbacksByDisease,
} from "@/lib/community/experience-search";
import { isModerator } from "@/lib/community/roles";
import {
  isCommunitySort,
  listDiseaseStats,
  listFollows,
  listPosts,
} from "@/lib/community/store";
import type { CommunityViewer } from "@/lib/community/store";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Peer support for people living with a health condition and the people who care for them. Read real experiences, ask a practical question, and find a disease-specific community.",
};

export const instant = false;

type SearchParams = Promise<{ q?: string; disease?: string; sort?: string }>;

export default async function CommunityHubPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const params = await searchParams;
  const user = await getCurrentUser();
  const viewer: CommunityViewer | null = user
    ? { id: user.id, isModerator: isModerator(user.email) }
    : null;

  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const diseaseId =
    typeof params.disease === "string" && isDiseaseId(params.disease)
      ? params.disease
      : undefined;
  const sort = isCommunitySort(params.sort) ? params.sort : "recent";

  const stats = new Map(listDiseaseStats().map((row) => [row.diseaseId, row]));
  const followed = user ? listFollows(user.id) : [];
  const followedNames = followed
    .map((id) => getDisease(id)?.shortName)
    .filter((name): name is string => Boolean(name));

  const feed = listPosts({
    diseaseId,
    query: query || undefined,
    sort,
    limit: 30,
    viewer,
  });

  const unanswered = listPosts({
    diseaseId,
    sort: "unanswered",
    limit: 5,
    viewer,
  });

  const helpful = listPosts({ sort: "helpful", limit: 8, viewer })
    .filter((post) => post.reactionCount > 0)
    .slice(0, 4);

  const followedPosts =
    followed.length > 0
      ? listPosts({ diseaseIds: followed, sort: "active", limit: 5, viewer })
      : [];

  const filtered = Boolean(query || diseaseId || sort !== "recent");
  const experienceFallbacks = verifiedFallbacksByDisease();

  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">Peer support</p>
          <h1>Talk to people who have been through it</h1>
          <p className="lede">
            Every community here is made of people describing their own
            experience, not clinicians issuing instructions. Read first if you
            prefer; posting is optional.
          </p>
          <div className="community-actions">
            <Link className="btn btn--primary" href="#communities">
              Find your community
            </Link>
            <Link className="btn" href="#experiences">
              Read patient experiences
            </Link>
            <Link className="btn" href="/community/guidelines">
              Community guidelines
            </Link>
          </div>
        </div>

        <div className="grid-2">
          <div className="notice notice--info">
            <p className="notice__title">What this space is for</p>
            <p style={{ marginBottom: "var(--space-2)" }}>
              Sharing what an illness or a long-term condition has actually been
              like, asking practical questions, and supporting someone else.
              Experiences are personal; they are not proof that a treatment works.
            </p>
            <p className="meta" style={{ margin: 0 }}>
              Nothing here is diagnosis or medical advice. For a decision about
              your care, talk to a clinician who knows your situation.
            </p>
          </div>

          <div className="notice notice--danger">
            <p className="notice__title">This is not an emergency service</p>
            <p style={{ marginBottom: "var(--space-2)" }}>
              Posts are not monitored around the clock. If someone has chest pain,
              difficulty breathing, a seizure, or another urgent symptom, contact
              local emergency services now rather than waiting for a reply.
            </p>
            <Link href="/guidance">See the urgent warning signs</Link>
          </div>
        </div>

        <ExperienceExplorer
          diseases={DISEASES.map((item) => ({
            id: item.id,
            name: item.name,
            shortName: item.shortName,
            starterQuestion: item.starterQuestion,
          }))}
          initialDiseaseId={diseaseId ?? "chikungunya"}
          signedIn={Boolean(user)}
          showDiseaseSelect
          fallbacks={experienceFallbacks}
          providerFindings={PROVIDER_FINDINGS}
        />

        <section id="communities" className="stack-tight" aria-labelledby="communities-heading">
          <div className="section-head">
            <div className="section-head__text">
              <p className="kicker">Available now</p>
              <h2 id="communities-heading">Disease communities</h2>
              <p>
                Each community has its own discussion topics. Counts below are the
                discussions actually stored, not a member estimate.
              </p>
            </div>
          </div>

          <ul className="community-disease-grid list-plain">
            {DISEASES.map((disease) => {
              const row = stats.get(disease.id);
              return (
                <li key={disease.id}>
                  <article className="card community-disease">
                    <h3 style={{ margin: 0 }}>
                      <Link href={`/community/${disease.id}`}>
                        {disease.name}
                      </Link>
                    </h3>
                    <p className="meta" style={{ margin: 0 }}>
                      {row
                        ? `${row.posts} ${row.posts === 1 ? "discussion" : "discussions"} · ${row.unanswered} without a reply`
                        : "No discussions yet"}
                    </p>
                    <p style={{ margin: 0 }}>{disease.intro}</p>
                    <Link className="btn btn--small btn--link" href={`/community/${disease.id}`}>
                      Open the {disease.shortName} community
                    </Link>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        {user ? (
          <section className="stack-tight" aria-labelledby="your-communities">
            <div className="section-head">
              <div className="section-head__text">
                <p className="kicker">Your choices</p>
                <h2 id="your-communities">Communities you follow</h2>
                <p>
                  Following is a display preference you chose. It is not stored in
                  your health profile and does not imply a diagnosis.
                </p>
              </div>
              {followed.length > 0 ? (
                <p className="meta" style={{ margin: 0 }}>
                  Following: {followedNames.join(", ")}
                </p>
              ) : null}
            </div>

            {followed.length === 0 ? (
              <div className="empty-state">
                <h3>You are not following a community yet</h3>
                <p className="meta" style={{ margin: 0 }}>
                  Open a community and choose “Follow this community” to put it
                  first here. You can browse every community without following one.
                </p>
              </div>
            ) : (
              <CommunityFeed
                posts={followedPosts}
                showDisease
                emptyTitle="No discussions in the communities you follow"
                emptyBody="The communities are quiet at the moment. You can start the first discussion, or browse everything below."
              />
            )}
          </section>
        ) : (
          <div className="notice notice--info">
            <p className="notice__title">Reading is open to everyone</p>
            <p style={{ margin: 0 }}>
              An account is only needed to post, reply, mark something helpful, or
              follow a community.{" "}
              <Link href="/account">Sign in or create one</Link> when you want to
              join in.
            </p>
          </div>
        )}

        <section className="stack-tight" aria-labelledby="feed-heading">
          <div className="section-head">
            <div className="section-head__text">
              <p className="kicker">All discussions</p>
              <h2 id="feed-heading">
                {filtered ? "Matching discussions" : "Recent discussions"}
              </h2>
              <p>
                {filtered
                  ? `${feed.length} ${feed.length === 1 ? "discussion matches" : "discussions match"} the current filters.`
                  : "Newest activity across every community, with unanswered questions marked."}
              </p>
            </div>
          </div>

          <CommunityFilters
            action="/community"
            q={query}
            sort={sort}
            diseases={DISEASES}
            diseaseId={diseaseId}
          />

          <CommunityFeed
            posts={feed}
            showDisease
            emptyTitle={filtered ? "No discussions match" : "No discussions yet"}
            emptyBody={
              filtered
                ? "Try a shorter search, a different community, or clear the filters."
                : "Open a community and start the first discussion. A short question is enough."
            }
            emptyHref="/community/chikungunya"
            emptyLabel="Start in the Chikungunya community"
          />
        </section>

        <div className="grid-2">
          <section className="stack-tight" aria-labelledby="unanswered-heading">
            <div className="section-head">
              <div className="section-head__text">
                <p className="kicker">A question needs a person</p>
                <h2 id="unanswered-heading" style={{ fontSize: "1.55rem" }}>
                  Unanswered questions
                </h2>
              </div>
            </div>
            <CommunityFeed
              posts={unanswered}
              showDisease
              emptyTitle="Every question has a reply"
              emptyBody="There is nothing waiting for an answer right now."
            />
          </section>

          <section className="stack-tight" aria-labelledby="helpful-heading">
            <div className="section-head">
              <div className="section-head__text">
                <p className="kicker">Marked by readers</p>
                <h2 id="helpful-heading" style={{ fontSize: "1.55rem" }}>
                  Discussions marked helpful
                </h2>
              </div>
            </div>
            {helpful.length === 0 ? (
              <div className="empty-state">
                <h3>No helpful marks yet</h3>
                <p className="meta" style={{ margin: 0 }}>
                  A discussion appears here once a signed-in reader marks it
                  helpful. Nothing is ranked until someone actually does.
                </p>
              </div>
            ) : (
              <CommunityFeed posts={helpful} showDisease />
            )}
          </section>
        </div>

        <div className="panel stack-tight">
          <h2 style={{ fontSize: "1.35rem" }}>Keep the space usable</h2>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            <li>Share experience, not instructions about medicines or doses.</li>
            <li>Do not post phone numbers, addresses, email addresses, or anyone else&apos;s health information.</li>
            <li>Report harassment, spam, scams, or unsafe advice with the report control on the post or reply.</li>
            <li>
              A moderator can remove content. Authors can always edit or delete
              their own words. Read the{" "}
              <Link href="/community/guidelines">full community guidelines</Link>.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
