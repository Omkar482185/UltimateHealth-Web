import Link from "next/link";

import type { CommunityTopic } from "@/lib/community/diseases";
import { COMMUNITY_SORTS, type CommunitySort } from "@/lib/community/store";

/**
 * Search and sorting for a feed. It is a plain GET form, so it works without
 * JavaScript and every filtered view has a URL that can be shared or bookmarked.
 */
export function CommunityFilters({
  action,
  q,
  sort,
  topics,
  topicId,
  diseases,
  diseaseId,
  label = "Search discussions",
}: {
  action: string;
  q?: string;
  sort: CommunitySort;
  topics?: readonly CommunityTopic[];
  topicId?: string;
  /** Hub only: lets a reader narrow the feed to one disease community. */
  diseases?: readonly { id: string; name: string }[];
  diseaseId?: string;
  label?: string;
}) {
  const filtered = Boolean(q || topicId || diseaseId || sort !== "recent");

  return (
    <form className="panel stack" method="get" action={action} role="search">
      <div className="filter-bar">
        <div className="field" style={{ flex: "1 1 18rem", marginBottom: 0 }}>
          <label className="field__label" htmlFor="community-q">
            {label}
          </label>
          <input
            className="input"
            id="community-q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            maxLength={120}
            placeholder="For example: joint pain at night, returning to work"
          />
        </div>

        {diseases && diseases.length > 0 ? (
          <div className="field" style={{ flex: "0 1 14rem", marginBottom: 0 }}>
            <label className="field__label" htmlFor="community-disease">
              Community
            </label>
            <select
              className="select"
              id="community-disease"
              name="disease"
              defaultValue={diseaseId ?? ""}
            >
              <option value="">All communities</option>
              {diseases.map((disease) => (
                <option key={disease.id} value={disease.id}>
                  {disease.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {topics && topics.length > 0 ? (
          <div className="field" style={{ flex: "0 1 15rem", marginBottom: 0 }}>
            <label className="field__label" htmlFor="community-topic">
              Topic
            </label>
            <select
              className="select"
              id="community-topic"
              name="topic"
              defaultValue={topicId ?? ""}
            >
              <option value="">All topics</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="field" style={{ flex: "0 1 13rem", marginBottom: 0 }}>
          <label className="field__label" htmlFor="community-sort">
            Sort by
          </label>
          <select
            className="select"
            id="community-sort"
            name="sort"
            defaultValue={sort}
          >
            {COMMUNITY_SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn--primary" type="submit">
          Apply
        </button>
        {filtered ? (
          <Link className="btn" href={action}>
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
