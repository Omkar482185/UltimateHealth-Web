"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Profile } from "@/lib/auth/users";
import {
  ACTIVITY_GOAL_MINUTES,
  CONDITION_OPTIONS,
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  LANGUAGE_OPTIONS,
  MAX_CONDITIONS,
  MAX_GOALS,
  MAX_INTERESTS,
  SLEEP_GOAL_HOURS,
} from "@/lib/profile/options";

type AccountSummary = { email: string; createdAt: string };

type Props = {
  signedIn: AccountSummary | null;
  profile: Profile | null;
  consentVersion: string;
};

const SEX_OPTIONS = [
  { value: "", label: "Not stated" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "intersex", label: "Intersex" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

/**
 * Account panel.
 *
 * One component handles both states because the two are the same object seen from
 * either side, and splitting them would duplicate the error handling. Every
 * message is rendered from the server's own response text rather than replaced
 * with a friendlier guess, so a failure can never be reported as a success.
 */
export function AccountPanel({ signedIn, profile, consentVersion }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptConsent, setAcceptConsent] = useState(false);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [birthYear, setBirthYear] = useState(profile?.birthYear ? String(profile.birthYear) : "");
  const [sexAtBirth, setSexAtBirth] = useState(profile?.sexAtBirth ?? "");
  const [heightCm, setHeightCm] = useState(profile?.heightCm ? String(profile.heightCm) : "");
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [goals, setGoals] = useState<string[]>(profile?.goals ?? []);
  const [conditions, setConditions] = useState<string[]>(
    profile?.selfReportedConditions ?? [],
  );
  const [sleepGoalHours, setSleepGoalHours] = useState(
    profile?.sleepGoalHours ? String(profile.sleepGoalHours) : "",
  );
  const [activityGoalMinutes, setActivityGoalMinutes] = useState(
    profile?.activityGoalMinutes ? String(profile.activityGoalMinutes) : "",
  );
  const [preferredLanguage, setPreferredLanguage] = useState(
    profile?.preferredLanguage ?? "",
  );

  /**
   * Selection is capped in the interface as well as on the server. Hitting the cap
   * disables the remaining options rather than silently dropping a selection when
   * the form is submitted.
   */
  function toggle(
    values: string[],
    setValues: (next: string[]) => void,
    id: string,
    max: number,
    atCap: boolean,
  ) {
    if (values.includes(id)) {
      setValues(values.filter((value) => value !== id));
      return;
    }
    if (atCap) return;
    setValues([...values, id].slice(0, max));
  }

  function clearOptionalHealthDetails() {
    setInterests([]);
    setGoals([]);
    setConditions([]);
    setSleepGoalHours("");
    setActivityGoalMinutes("");
  }

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function send(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (!response.ok) {
        const message =
          parsed && typeof parsed === "object" && "error" in parsed
            ? String((parsed as { error: unknown }).error)
            : `The request failed with status ${response.status}.`;
        setError(message);
        return null;
      }
      return parsed;
    } catch {
      setError("The request could not reach the server. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="panel stack" style={{ maxWidth: "34rem" }}>
        <div className="tabs" role="tablist" aria-label="Account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "tab tab--active" : "tab"}
            onClick={() => {
              setMode("signin");
              setError(null);
              setOk(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "tab tab--active" : "tab"}
            onClick={() => {
              setMode("register");
              setError(null);
              setOk(null);
            }}
          >
            Create an account
          </button>
        </div>

        <p className="meta">
          {mode === "signin"
            ? "Sign in to keep your own measurements and profile on this device's server."
            : "An account is only needed to save your own measurements. Browsing, the assistant and symptom guidance all work without one."}
        </p>

        {error ? <p className="field__error" role="alert">{error}</p> : null}
        {ok ? <p className="form__success" role="status">{ok}</p> : null}

        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const payload =
              mode === "signin"
                ? { email, password }
                : { email, password, acceptConsent };
            const result = await send(
              "POST",
              mode === "signin" ? "/api/auth/login" : "/api/auth/register",
              payload,
            );
            if (result) {
              setPassword("");
              setAcceptConsent(false);
              router.refresh();
            }
          }}
        >
          <label className="field">
            <span className="field__label">Email address</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={mode === "register" ? "password-help" : undefined}
            />
            {mode === "register" ? (
              <span className="field__hint" id="password-help">
                At least 12 characters. A few ordinary words in a row is better than
                one short scrambled word.
              </span>
            ) : null}
          </label>

          {mode === "register" ? (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={acceptConsent}
                onChange={(event) => setAcceptConsent(event.target.checked)}
                required
              />
              <span>
                I understand this stores a profile and any measurements I enter in the
                server&apos;s own database, that it is not a medical record, and that I
                can export or delete all of it at any time.
              </span>
            </label>
          ) : null}

          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="stack">
      {error ? <p className="field__error" role="alert">{error}</p> : null}
      {ok ? <p className="form__success" role="status">{ok}</p> : null}

      <section className="panel stack">
        <h2 className="panel-title">Profile</h2>
        <p className="meta">
          The four answers at the top change how a reading is interpreted. The optional
          sections below are used for one thing each: your interests and goals decide
          which learning material the dashboard suggests, and the readings you ask it to
          watch. Nothing here is required, every field can be cleared, and there is no
          free-text medical history.
        </p>

        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await send("PUT", "/api/account/profile", {
              displayName: displayName.trim() === "" ? null : displayName.trim(),
              birthYear: birthYear.trim() === "" ? null : Number(birthYear),
              sexAtBirth: sexAtBirth === "" ? null : sexAtBirth,
              heightCm: heightCm.trim() === "" ? null : Number(heightCm),
              interests,
              goals,
              selfReportedConditions: conditions,
              sleepGoalHours:
                sleepGoalHours.trim() === "" ? null : Number(sleepGoalHours),
              activityGoalMinutes:
                activityGoalMinutes.trim() === "" ? null : Number(activityGoalMinutes),
              preferredLanguage: preferredLanguage === "" ? null : preferredLanguage,
            });
            if (result) {
              setOk("Profile saved.");
              router.refresh();
            }
          }}
        >
          <label className="field">
            <span className="field__label">Preferred name (optional)</span>
            <input
              className="input"
              type="text"
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">Year of birth (optional)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1900}
              max={new Date().getFullYear()}
              value={birthYear}
              onChange={(event) => setBirthYear(event.target.value)}
            />
            <span className="field__hint">
              Stored with your account and included in your export. Nothing in this
              platform reads it yet, so no care level or reference range depends on it.
            </span>
          </label>

          <label className="field">
            <span className="field__label">Sex at birth (optional)</span>
            <select
              className="select"
              value={sexAtBirth}
              onChange={(event) => setSexAtBirth(event.target.value)}
            >
              {SEX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="field__hint">
              Stored with your account and included in your export. Some reference ranges
              differ by sex, but none is applied here yet, and this is not used for
              anything else.
            </span>
          </label>

          <label className="field">
            <span className="field__label">Height in centimetres (optional)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={50}
              max={250}
              value={heightCm}
              onChange={(event) => setHeightCm(event.target.value)}
            />
            <span className="field__hint">
              Stored with your account and included in your export. No calculation here
              uses it.
            </span>
          </label>

          <fieldset className="panel stack-tight">
            <legend className="field__label" style={{ padding: 0 }}>
              Health interests (optional, up to {MAX_INTERESTS})
            </legend>
            <p className="meta" style={{ margin: 0 }}>
              Used to decide which source documents, episodes and general information the
              dashboard puts in front of you. It is a filter over published material, not
              a description of you.
            </p>
            <div className="checkbox-grid">
              {INTEREST_OPTIONS.map((option) => {
                const checked = interests.includes(option.id);
                const atCap = !checked && interests.length >= MAX_INTERESTS;
                return (
                  <label key={option.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() =>
                        toggle(interests, setInterests, option.id, MAX_INTERESTS, atCap)
                      }
                    />
                    <span>
                      {option.label}
                      <br />
                      <span className="muted">{option.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="panel stack-tight">
            <legend className="field__label" style={{ padding: 0 }}>
              What you would like to get out of this (optional, up to {MAX_GOALS})
            </legend>
            <p className="meta" style={{ margin: 0 }}>
              A goal selects relevant education. It is not turned into a target, a
              deadline, or a claim about what you should achieve, and no source sets it
              for you.
            </p>
            <div className="checkbox-grid">
              {GOAL_OPTIONS.map((option) => {
                const checked = goals.includes(option.id);
                const atCap = !checked && goals.length >= MAX_GOALS;
                return (
                  <label key={option.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => toggle(goals, setGoals, option.id, MAX_GOALS, atCap)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="panel stack-tight">
            <legend className="field__label" style={{ padding: 0 }}>
              Conditions a clinician has told you about (optional, up to {MAX_CONDITIONS})
            </legend>
            <p className="meta" style={{ margin: 0 }}>
              This is the only sensitive item in the profile and it is asked for one
              reason: it is what makes the dashboard suggest content that is actually
              relevant, and what makes a reminder to speak to a clinician specific rather
              than generic. It is stored exactly as you select it and shown everywhere as
              your own account rather than a verified record. It is never used to infer a
              diagnosis, to decide a care level, or to set a threshold, and the symptom
              guidance and emergency screen do not read it at all. Leave it empty if you
              would rather not say.
            </p>
            <div className="checkbox-grid">
              {CONDITION_OPTIONS.map((option) => {
                const checked = conditions.includes(option.id);
                const atCap = !checked && conditions.length >= MAX_CONDITIONS;
                return (
                  <label key={option.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() =>
                        toggle(conditions, setConditions, option.id, MAX_CONDITIONS, atCap)
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid-2">
            <label className="field">
              <span className="field__label">Sleep goal in hours (optional)</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={SLEEP_GOAL_HOURS.min}
                max={SLEEP_GOAL_HOURS.max}
                value={sleepGoalHours}
                onChange={(event) => setSleepGoalHours(event.target.value)}
              />
              <span className="field__hint">
                Compared on the dashboard with the hours you record, and with nothing
                else.
              </span>
            </label>

            <label className="field">
              <span className="field__label">
                Daily activity goal in minutes (optional)
              </span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={ACTIVITY_GOAL_MINUTES.min}
                max={ACTIVITY_GOAL_MINUTES.max}
                value={activityGoalMinutes}
                onChange={(event) => setActivityGoalMinutes(event.target.value)}
              />
              <span className="field__hint">
                Compared with the minutes you record, and with nothing else.
              </span>
            </label>
          </div>

          <label className="field">
            <span className="field__label">Preferred language (optional)</span>
            <select
              className="select"
              value={preferredLanguage}
              onChange={(event) => setPreferredLanguage(event.target.value)}
            >
              <option value="">No preference</option>
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="field__hint">
              Only used to open the podcasts tab on that language of catalogue, which
              currently holds episodes in English and Hindi.
            </span>
          </label>

          <div className="row">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={clearOptionalHealthDetails}
            >
              Clear optional health details
            </button>
          </div>
          <p className="meta" style={{ margin: 0 }}>
            Clearing removes the interests, goals, disclosed conditions and both goals
            from this form. Press save to write that change; deleting the account removes
            all of it including the measurements.
          </p>
        </form>

        <p className="meta">
          {profile?.consentVersion
            ? `You accepted the storage notice (version ${profile.consentVersion}) on ${
                profile.consentAt
                  ? new Date(profile.consentAt).toISOString().slice(0, 10)
                  : "an earlier date"
              }.`
            : "No storage notice has been accepted on this account yet."}
          {profile?.consentVersion && profile.consentVersion !== consentVersion
            ? ` The current notice is version ${consentVersion}.`
            : ""}
        </p>
      </section>

      <section className="panel stack">
        <h2 className="panel-title">Your data</h2>
        <p className="meta">
          Download returns a formatted PDF report of everything held about this account:
          the profile, every measurement with its date, the material you saved, and the
          account dates. The password hash is not included, and questions you have asked
          the assistant are not included because they are not linked to any account. The
          same content is also available as JSON if you want to process it.
        </p>
        <div className="row">
          <a className="btn btn--primary" href="/api/account/export.pdf" download>
            Download my data as a PDF
          </a>
          <a className="btn" href="/api/account" download>
            Download as JSON
          </a>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              const result = await send("POST", "/api/auth/logout");
              if (result) router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      </section>

      <section className="panel panel--danger stack">
        <h2 className="panel-title">Delete this account</h2>
        <p className="meta">
          This removes the account, the profile and every measurement. It cannot be
          undone, and there is no backup to restore from. Your password is required
          as well as your session, so a borrowed session cannot destroy the account.
        </p>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await send("DELETE", "/api/account", {
              confirmation: deleteConfirm,
              password: deletePassword,
            });
            if (result) {
              setDeleteConfirm("");
              setDeletePassword("");
              setOk("Your account and its data have been deleted.");
              router.refresh();
            }
          }}
        >
          <label className="field">
            <span className="field__label">
              Type &ldquo;delete my account&rdquo; to confirm
            </span>
            <input
              className="input"
              type="text"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Your password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              required
            />
          </label>
          <button className="btn btn--danger" type="submit" disabled={busy}>
            {busy ? "Deleting…" : "Delete account permanently"}
          </button>
        </form>
      </section>
    </div>
  );
}
