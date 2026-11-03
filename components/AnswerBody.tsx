import type { Citation } from "@/lib/rag/generate";

/**
 * Renders generated text so that citation markers such as [S2] become links to the
 * matching entry in the evidence list.
 *
 * Only labels that survived citation validation reach this component, so every
 * marker here resolves to a supplied passage. A marker with no matching citation
 * is rendered as plain text rather than a dead link.
 */
export function AnswerBody({
  text,
  citations,
  anchorPrefix = "src",
}: {
  text: string;
  citations: Citation[];
  anchorPrefix?: string;
}) {
  const labels = new Set(citations.map((c) => c.label));
  const parts = text.split(/(\[[SWE]\d+\])/g);

  return (
    <div className="answer__body">
      {parts.map((part, index) => {
        const match = part.match(/^\[([SWE]\d+)\]$/);
        if (!match) return <span key={index}>{part}</span>;
        const label = match[1];
        if (!labels.has(label)) return <span key={index}>{part}</span>;
        return (
          <a
            key={index}
            className="cite"
            href={`#${anchorPrefix}-${label}`}
            aria-label={`Source ${label}`}
          >
            [{label}]
          </a>
        );
      })}
    </div>
  );
}

/** Evidence list backing an answer or explanation. */
export function CitationList({
  citations,
  anchorPrefix = "src",
  heading = "Sources behind this answer",
}: {
  citations: Citation[];
  anchorPrefix?: string;
  heading?: string;
}) {
  if (citations.length === 0) return null;

  return (
    <section aria-labelledby={`${anchorPrefix}-heading`}>
      <h3 id={`${anchorPrefix}-heading`}>{heading}</h3>
      <ol className="evidence">
        {citations.map((citation) => (
          <li key={citation.label} id={`${anchorPrefix}-${citation.label}`}>
            <span className="evidence__label">[{citation.label}]</span>{" "}
            <a href={citation.sourceUrl} rel="noreferrer">
              {citation.documentTitle}
            </a>
            <div className="meta">
              {citation.publisher}
              {citation.heading ? ` · section: ${citation.heading}` : ""}
              {citation.similarity !== null
                ? ` · retrieval similarity ${citation.similarity.toFixed(2)}`
                : ""}
            </div>
            <p className="meta" style={{ margin: "var(--space-2) 0 0" }}>
              {citation.licence}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
