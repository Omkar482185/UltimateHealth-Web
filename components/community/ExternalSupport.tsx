import { formatDate } from "@/lib/community/format";
import {
  CHIKUNGUNYA_DEDICATED_FINDING,
  VERIFIED_ON,
  type ExternalResource,
} from "@/lib/community/external";
import type { DiseaseCommunity } from "@/lib/community/diseases";

const ACTIVITY_LABEL: Record<ExternalResource["activity"], string | null> = {
  active: "Reported as active",
  "new-and-small": "New and very small",
  "not-established": "Activity not established",
  "not-applicable": null,
};

/**
 * External support for one disease.
 *
 * These are plain outbound links. Nothing is embedded, scraped, or presented as
 * an UltimateHealth discussion, and the activity label states exactly what was
 * visible when the link was checked. If no dedicated community could be verified,
 * this says so instead of filling the space with an unrelated group.
 */
export function ExternalSupport({
  disease,
  resources,
}: {
  disease: DiseaseCommunity;
  resources: readonly ExternalResource[];
}) {
  const peerCommunities = resources.filter(
    (resource) => resource.kind === "peer-community",
  );
  const organisations = resources.filter(
    (resource) =>
      resource.kind === "patient-organisation" || resource.kind === "support-service",
  );
  const communities = [...peerCommunities, ...organisations];
  const information = resources.filter(
    (resource) => resource.kind === "medical-information",
  );

  return (
    <section id="external-support" className="stack">
      <div className="section-head">
        <div className="section-head__text">
          <p className="kicker">Beyond this page</p>
          <h2>External support</h2>
          <p className="lede" style={{ marginBottom: 0 }}>
            Communities and reference material elsewhere on the web. Every link was
            opened and checked on {formatDate(VERIFIED_ON)}.
          </p>
        </div>
      </div>

      <div className="notice notice--warning">
        <p className="notice__title">You will leave UltimateHealth</p>
        <p style={{ margin: 0 }}>
          These links open another website. That platform&apos;s own registration,
          privacy policy, and community rules apply there. UltimateHealth does not
          moderate those spaces, has no partnership with them, and does not endorse
          them. Posts on another site are not UltimateHealth content.
        </p>
      </div>

      {peerCommunities.length === 0 ? (
        <div className="notice notice--info">
          <p className="notice__title">
            No dedicated online peer community was verified for {disease.name}
          </p>
          <p style={{ margin: 0 }}>
            During the check on {formatDate(VERIFIED_ON)} no active,
            {` ${disease.name.toLowerCase()}-specific`} online peer group could be
            confirmed. Verified support organisations are listed below where they
            exist, but they are not presented as a disease-specific forum. The
            discussion space above is the native UltimateHealth community.
          </p>
        </div>
      ) : null}

      {communities.length === 0 ? (
        <p className="meta" style={{ margin: 0 }}>
          No external organisation or community was verified for this disease yet.
        </p>
      ) : (
        <div className="community-external-grid">
          {communities.map((resource) => (
            <article key={resource.id} className="card community-external">
              <div className="community-post__tags">
                <span className="tag tag--accent">{resource.platform}</span>
                <span className="tag">
                  {resource.kind === "peer-community"
                    ? "Peer community"
                    : resource.kind === "patient-organisation"
                      ? "Patient organisation"
                      : "Support service"}
                </span>
                {ACTIVITY_LABEL[resource.activity] ? (
                  <span
                    className={
                      resource.activity === "active"
                        ? "tag tag--accent"
                        : "tag tag--warning"
                    }
                  >
                    {ACTIVITY_LABEL[resource.activity]}
                  </span>
                ) : null}
              </div>

              <h3>{resource.name}</h3>
              <p className="meta" style={{ margin: 0 }}>
                Addresses: {resource.addresses}
              </p>
              <p style={{ margin: 0 }}>{resource.description}</p>
              <p style={{ margin: 0 }}>
                <strong>Why it may be useful:</strong> {resource.whyUseful}
              </p>
              <p className="meta" style={{ margin: 0 }}>
                {resource.activityNote}
              </p>
              {resource.accessNote ? (
                <p className="meta" style={{ margin: 0 }}>
                  Access: {resource.accessNote}
                </p>
              ) : null}
              <p className="meta" style={{ margin: 0 }}>
                Last checked {formatDate(resource.checkedOn)} · Source:{" "}
                {resource.platform}
              </p>
              <a
                className="btn btn--small btn--link"
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer external"
              >
                {resource.kind === "peer-community"
                  ? "Visit external community"
                  : "Visit support organisation"}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </article>
          ))}
        </div>
      )}

      {disease.id === "chikungunya" ? (
        <p className="meta" style={{ margin: 0 }}>
          {CHIKUNGUNYA_DEDICATED_FINDING}
        </p>
      ) : null}

      {information.length > 0 ? (
        <div className="stack-tight">
          <h3>Medical information, not a patient community</h3>
          <p className="meta" style={{ margin: 0 }}>
            These are reference pages. They do not contain member discussions and are
            not a substitute for advice from a clinician who knows your situation.
          </p>
          <ul className="list-plain community-external-grid">
            {information.map((resource) => (
              <li key={resource.id} className="card community-external">
                <div className="community-post__tags">
                  <span className="tag">Medical information</span>
                  <span className="tag">{resource.platform}</span>
                </div>
                <h4 style={{ margin: 0 }}>{resource.name}</h4>
                <p style={{ margin: 0 }}>{resource.description}</p>
                <p className="meta" style={{ margin: 0 }}>
                  Last checked {formatDate(resource.checkedOn)}
                </p>
                <a
                  className="btn btn--small btn--link"
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer external"
                >
                  Read on {resource.platform}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="meta" style={{ margin: 0 }}>
        The directory is maintained in <code className="mono">lib/community/external.ts</code>.
        No member posts, profiles, or activity feeds are copied into UltimateHealth.
      </p>
    </section>
  );
}
