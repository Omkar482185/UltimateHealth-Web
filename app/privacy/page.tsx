import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What this platform stores, what it sends to third parties, and what it does not collect.",
};

export const instant = false;

export default function PrivacyPage() {
  return (
    <section className="section section--flush">
      <div className="container stack policy">
        <div className="page-head">
          <p className="eyebrow">Draft for review</p>
          <h1>Privacy policy</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            This policy describes what the software in this repository actually does.
            Every statement below corresponds to implemented behaviour. Items that
            depend on decisions outside the code, such as hosting and contact
            details, are marked Draft for review rather than invented.
          </p>
        </div>

        <div className="notice notice--warning">
          <p className="notice__title">Status</p>
          <p style={{ margin: 0 }}>
            This is a draft for review. No regulatory assessment has been carried out
            under any data protection framework, including the GDPR, the UK GDPR, or
            India&apos;s Digital Personal Data Protection Act. No compliance claim is
            made here or anywhere on this platform.
          </p>
        </div>

        <section className="stack-tight">
          <h2>Two ways to use this platform</h2>
          <p>
            Everything can be read without an account: the source library, the
            assistant, the symptom guidance, the Chikungunya pages, and the whole
            podcasts and videos catalogue. An account is needed for the four things that
            are personal: keeping measurements you record yourself, the profile sections
            that decide which learning material is suggested to you, the dashboard built
            from those, and the personal-data download.
          </p>
          <p className="meta">
            This section describes the account feature as it is actually implemented.
            It is not a statement about any other deployment of this code, and no
            regulatory assessment has been performed.
          </p>
        </section>

        <section className="stack-tight">
          <h2>What this platform does not collect</h2>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>
              No analytics, tracking scripts, advertising identifiers, or third-party
              monitoring services are loaded.
            </li>
            <li>
              No name, postal address, telephone number, or date of birth is requested.
              A profile has an optional preferred name and an optional year of birth,
              and both may be left empty.
            </li>
            <li>
              No social sign-in, and no data is received from any external identity
              provider. There is no third-party authentication service: passwords are
              hashed and sessions are stored in this deployment&apos;s own database.
            </li>
            <li>
              No measurement, profile value, or account identifier is ever included in
              a request to a language model. The assistant cannot see your records.
            </li>
          </ul>
        </section>

        <section className="stack-tight">
          <h2>If you create an account</h2>
          <p>The account stores only the following, in the same local SQLite file:</p>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>
              Your email address, stored lowercased so that a differently capitalised
              address does not create a second account.
            </li>
            <li>
              A password hash produced with scrypt, together with the cost parameters
              it was made with. Your password itself is never stored and cannot be
              recovered from the hash. Nobody, including the operator of this
              deployment, can read it.
            </li>
            <li>
              A session row for each signed-in browser: a creation time, an expiry, and
              a SHA-256 digest of the session token. The token itself is held only in
              your browser, in a cookie, which is why a copy of the database does not
              let anyone sign in as you.
            </li>
            <li>
              The optional profile fields you choose to give: a preferred name, a year
              of birth, sex at birth, and a height. They are stored with the account and
              shown in your export. No code path reads them to interpret a measurement:
              the care levels, the warning signs and the trend figures use only the
              values you recorded, the symptoms you selected, and the thresholds in the
              cited sources. They are offered because an age-specific reference range is
              a plausible later addition, and the profile form says plainly that nothing
              uses them today.
            </li>
            <li>
              Which version of the storage notice you accepted, and when. This is
              recorded so that a later change to that wording is visible.
            </li>
            <li>
              Any measurements you enter: the kind, the value, the unit, the time you
              recorded, an optional note, and the fact that it is self-reported.
            </li>
            <li>
              The optional sections of the profile you choose to fill in: health
              interests and goals selected from fixed lists, a sleep goal and an
              activity goal, a preferred language, and any condition you choose to
              disclose. All of these are stored as identifiers from those fixed lists.
              There is no free-text field for health information anywhere in the
              profile.
            </li>
            <li>
              Any condition you disclose is the only sensitive item stored here, and it
              is stored exactly as you selected it. It is not inferred, and nothing in
              the platform reads it to decide a care level or to set a threshold: the
              symptom guidance and the emergency screen do not read the profile at all.
            </li>
            <li>
              The learning material you save: a reference to the podcasts catalogue entry
              or source document, never a copy of the content. The title and link you see
              are read from the catalogue when the list is displayed.
            </li>
            <li>
              For a suggestion you dismiss or mark done, only its identifier and which of
              those two you chose. The wording is recomputed from your current data every
              time, so nothing you have since changed can be replayed back to you from a
              stored string.
            </li>
          </ul>
          <p>
            The personal-data download renders a PDF from exactly these rows, and the
            JSON download contains the same report. Neither includes your password hash,
            and neither is written to disk on the server: the PDF is assembled in memory
            for that one response, which is marked <code className="mono">no-store</code>
            so a shared cache cannot keep a copy.
          </p>
          <p>
            There is no sharing feature, no public profile, and no administrative view
            of other people&apos;s records. Every query that returns health data filters
            on the account resolved from your session cookie, and no endpoint accepts a
            user identifier as input.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Cookies</h2>
          <p>
            One cookie, <code className="mono">uh_session</code>, and only after you
            sign in. It is HttpOnly, so no script on the page can read it; SameSite=Lax,
            so it is not attached to cross-site form posts; and it carries the opaque
            session token described above. There is no advertising, analytics, or
            preference cookie, and this platform sets no other cookie. One third party
            is contacted, and only when you ask for it: opening a podcast episode embeds
            a player from YouTube, which may set its own cookie when it loads. Nothing
            from YouTube is requested before you open an episode, and the catalogue page
            embeds nothing at all.
          </p>
        </section>

        <section className="stack-tight">
          <h2>What is stored about questions</h2>
          <p>
            The application keeps a local table of assistant interactions for
            evaluation and debugging. Each row records the question text, the answer
            mode, the identifiers of the passages that were retrieved, the highest
            cosine similarity, the latency, and the citation counts.
          </p>
          <p>
            It records no IP address, no user agent, and no account identifier. Rows in
            this table carry no link to a person, so a question asked while signed in is
            not attributed to the account and does not appear in a data export. The
            assistant is deliberately not personalised for the same reason.
          </p>
          <p>
            This data lives in a single SQLite file at{" "}
            <code className="mono">website/data/health.db</code>, alongside the ingested
            corpus. Deleting that file removes the interaction log entirely. There is
            no backup, no replication, and no external copy.
          </p>
        </section>

        <section className="stack-tight">
          <h2>What is sent to third parties</h2>
          <p>
            Answers are written by a locally served language model. The operator
            configures where that model runs with{" "}
            <code className="mono">OLLAMA_BASE_URL</code>; in local development it is
            the same machine as the server. When you submit a question, the model
            receives:
          </p>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>Your question text.</li>
            <li>
              The retrieved passages, which are public health documents already
              published by WHO, the NHS, and MedlinePlus. These passages are not
              about you.
            </li>
          </ul>
          <p>
            No API key is involved in that request. If an operator points the server
            at a model host elsewhere, those inputs leave this machine and travel to
            that host under the operator&apos;s control.
          </p>
          <p>
            Search is separate from generation. To find the passages, your question is
            converted into a numerical vector by Google&apos;s Gemini embedding API, so
            the question text is sent to Google for that one request. The symptom
            guidance text you enter is also used to build that request, so it can be
            included. Do not enter identifying details. The same embedding API is
            called at ingestion time, but there it processes published documents and
            involves no user input.
          </p>
          <p>
            No stored health record is ever sent to either provider. Nothing from the
            accounts tables is read by the assistant at all, so there is no code path
            by which a measurement or a profile value could reach them.
          </p>
          <p>
            One other third party is contacted, and only on request. The podcast and
            video pages embed a player from YouTube, so opening an episode sends a
            request to Google&apos;s servers that reveals your IP address and which video
            you opened. The player uses the{" "}
            <code className="mono">youtube-nocookie.com</code> host to limit what that
            request carries, and a direct link to the video on YouTube is always shown
            beside the player. No part of the catalogue is fetched until you open an
            episode: the list you browse is stored in this application.
          </p>
          <p className="meta">
            Draft for review: the third-party provider&apos;s current data handling
            terms, retention behaviour, and training arrangements must be reviewed and
            recorded here, with dates, before this platform is published.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Server logs</h2>
          <p>
            The Next.js server writes ordinary request logs to its console. These can
            contain IP addresses and request paths. They are held by the process and
            are not written to the application database.
          </p>
          <p className="meta">
            Draft for review: once a hosting provider is chosen, that provider&apos;s
            logging and retention behaviour must be documented here, including whether
            it retains request metadata and for how long.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Your rights and controls</h2>
          <p>These are implemented controls, not promises:</p>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>
              <strong>Export.</strong> The account page renders everything held about
              your account as a PDF for reading, and the same report is available as a
              JSON file for processing, including every measurement. The password
              hash is deliberately excluded from both, because it cannot be reversed and its
              digest is only useful to an attacker.
            </li>
            <li>
              <strong>Erase.</strong> Deleting an account removes the account, the
              profile, every measurement, and every session in a single
              <code className="mono">DELETE</code> that cascades. It cannot be undone
              and there is no backup to restore from. Your password is required in
              addition to your session, so a borrowed session cannot destroy the
              account.
            </li>
            <li>
              <strong>Correct.</strong> Every profile field can be edited or cleared at
              any time, and clearing a field removes the stored value rather than
              leaving the old one behind. Individual measurements can be edited or
              deleted on their own, so correcting one reading does not mean deleting
              the history around it.
            </li>
            <li>
              <strong>Sign out.</strong> Signing out deletes the session row as well as
              the cookie, so the token stops working rather than merely being
              forgotten by one browser.
            </li>
            <li>
              <strong>The interaction log</strong> carries no account identifier, so it
              cannot be exported or erased per person. It can be cleared by deleting
              the database file or by asking the operator of this deployment to do so.
            </li>
          </ul>
          <p className="meta">
            Draft for review: a contact address for privacy requests must be added
            before publication. No address, organisation, or data protection officer is
            invented here.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Children</h2>
          <p>
            This platform is not directed at children and provides no paediatric
            guidance. It should not be used as a source of advice about a child&apos;s
            health.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Changes</h2>
          <p>
            The code that determines what is stored is in this repository, so this
            policy can be checked against the implementation. If the software changes,
            this page must change with it.
          </p>
          <p>
            See also <Link href="/terms">the terms of service</Link> and{" "}
            <Link href="/method">how it works</Link>.
          </p>
        </section>
      </div>
    </section>
  );
}
