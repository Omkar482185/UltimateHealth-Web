import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { RecordsPanel } from "@/components/RecordsPanel";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  buildTrends,
  countRecords,
  LIST_LIMIT_DEFAULT,
  listRecords,
} from "@/lib/health/records";

export const metadata: Metadata = {
  title: "Health records",
  description:
    "Keep your own blood pressure, weight, glucose, sleep and activity readings, and see them drawn from your numbers alone.",
};

/**
 * Health records.
 *
 * Rendered on the server, so the signed-in state is settled before anything
 * reaches the browser and no record is delivered to a page that has not been
 * authenticated.
 *
 * `await connection()` comes first, and it is load-bearing rather than decorative.
 * Resolving the session reads the current time to compare it against the session's
 * expiry, and Next treats a current-time read during prerendering as an error
 * (`blocking-prerender-current-time`). Waiting for the request first means the
 * session is only ever resolved while serving a real request, which is the only
 * context in which it means anything. The same pattern is used by the document
 * page under `/library`.
 */
export const instant = false;

export default async function RecordsPage() {
  await connection();
  const user = await getCurrentUser();
  const records = user ? listRecords(user.id, { limit: LIST_LIMIT_DEFAULT }) : [];
  const total = user ? countRecords(user.id) : 0;
  const trends = buildTrends(records);

  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">Your measurements</p>
          <h1>Health records</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            Record a reading and it is kept against your account, then drawn from your
            own numbers. Nothing on this page is estimated, predicted, or filled in from
            anyone else&apos;s data.
          </p>
        </div>

        {!user ? (
          <>
            <div className="notice notice--info">
              <p className="notice__title">Sign in to keep records</p>
              <ul style={{ marginBottom: 0 }}>
                <li>
                  Records are stored against one account and reachable only through that
                  account&apos;s session. There is no endpoint that accepts a user
                  identifier, so one account cannot read another&apos;s readings.
                </li>
                <li>
                  Everything else on the platform works without signing in. An account
                  exists for this page and the profile fields that change how a reading
                  is interpreted.
                </li>
                <li>
                  You can export or delete all of it from{" "}
                  <Link href="/account">your account</Link> at any time.
                </li>
              </ul>
            </div>
            <div className="panel stack">
              <h2 className="panel-title">What would be stored</h2>
              <p style={{ margin: 0 }}>
                For each reading: which kind of measurement it is, the value and unit,
                the time you say it was taken, an optional note you write yourself, and
                the fact that it is self-reported. That is the whole row. There is no
                name field, no location, and no device identifier.
              </p>
              <div className="row">
                <Link className="btn btn--primary" href="/account">
                  Sign in or create an account
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <RecordsPanel
              initialRecords={records}
              initialTrends={trends}
              loadedCap={LIST_LIMIT_DEFAULT}
            />

            <section className="panel stack-tight">
              <h2 className="panel-title">
                What these numbers are and are not
              </h2>
              <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                <li>
                  Every value shown was typed in by you. This platform does not measure
                  anything, does not fill a gap to make a line look complete, and does not
                  generate a plan from your readings.
                </li>
                <li>
                  A mean, a lowest and a highest are arithmetic on your own entries. They
                  are not clinical measurements and are not compared with any threshold,
                  here or elsewhere.
                </li>
                <li>
                  A change between two readings can come from the device, the cuff size,
                  the time of day, or who took it. This page draws the line and stops
                  there, because interpreting it is a clinical judgement.
                </li>
                <li>
                  These records are not a medical record and do not replace one. Share
                  them with a clinician rather than treating them as an answer on their own.
                </li>
                <li>
                  {total} {total === 1 ? "record is" : "records are"} held for this account.
                  Deleting a record removes it immediately; deleting the account removes
                  every record with it.
                </li>
              </ul>
            </section>

            <section className="panel stack-tight">
              <h2 className="panel-title">
                If a reading worries you now
              </h2>
              <p style={{ margin: 0 }}>
                Do not wait for a trend. The symptom guidance page screens for emergency
                warning signs first, and it runs without a language model, so it works
                even when the assistant does not.{" "}
                <Link href="/guidance">Open symptom guidance</Link>. For a severe reading
                with symptoms such as chest pain, breathlessness, weakness on one side, or
                difficulty speaking, contact your local emergency number instead of using
                this page.
              </p>
            </section>
          </>
        )}
      </div>
    </section>
  );
}
