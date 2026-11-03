import type { Metadata } from "next";
import Link from "next/link";

import { SITE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "Permitted use, the educational scope of the content, third-party licences, and the limitations of AI-generated explanations.",
};

export const instant = false;

export default function TermsPage() {
  return (
    <section className="section section--flush">
      <div className="container stack policy">
        <div className="page-head">
          <p className="eyebrow">Draft for review</p>
          <h1>Terms of service</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            These terms describe the actual scope of this platform. They are written
            to be checked against the implementation in this repository rather than to
            be comprehensive.
          </p>
        </div>

        <div className="notice notice--warning">
          <p className="notice__title">Status</p>
          <p style={{ margin: 0 }}>
            Draft for review. The governing law, the operator&apos;s legal identity,
            and a contact address must be decided by the operator before publication.
            None is invented here.
          </p>
        </div>

        <section className="stack-tight">
          <h2>What this platform is</h2>
          <p>
            An educational health information website. It presents general health
            information drawn from published public health sources, an assistant that
            answers questions from that fixed corpus with citations, and guidance about
            warning signs associated with raised blood pressure.
          </p>
        </section>

        <section className="stack-tight">
          <h2>What it is not</h2>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>
              It is not a medical device, and it has not been clinically validated or
              approved by any regulator.
            </li>
            <li>
              It does not provide medical diagnosis, treatment, or prescription
              advice, and it does not replace assessment by a qualified professional.
            </li>
            <li>
              It gives no medication doses and never advises starting, stopping, or
              changing a prescribed medicine.
            </li>
            <li>
              It does not provide appointments, tests, referrals, or clinician access.
            </li>
            <li>
              It does not integrate with wearables or medical devices, and no data here
              is device-validated.
            </li>
          </ul>
          <p>
            Do not rely on this platform for a medical decision. In an emergency,
            contact your local emergency number immediately.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Permitted use</h2>
          <p>
            You may read, search, and cite the material here for personal, educational,
            or academic purposes. You may not present generated answers as clinical
            advice, use the platform to provide medical care to others, or attempt to
            overload or interfere with the service.
          </p>
          <p>
            Automated access is limited by a rate limiter. Requests are also rejected
            when they do not originate from the same site.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Your account</h2>
          <p>
            An account is optional and is needed only to keep measurements you record
            yourself. If you create one:
          </p>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>
              Keep your password to yourself. Anyone who has it, and can reach this
              deployment, can read and delete the data on that account. Choose a
              password you do not use anywhere else.
            </li>
            <li>
              Enter only your own information, and only what you are willing to store
              on this server. Do not enter another person&apos;s health information
              without their knowledge.
            </li>
            <li>
              This is not a medical record and does not replace one. Nothing here is a
              diagnosis, a prescription, or a clinical record, and the export is a JSON
              file rather than a document any clinician has to accept.
            </li>
            <li>
              You can export or permanently delete everything at any time from the
              account page. Deletion is immediate and irreversible, and there is no
              backup.
            </li>
            <li>
              The operator of this deployment can delete the database file, which
              removes every account at once. Nothing here should be your only copy of
              any measurement that matters to you.
            </li>
          </ul>
          <p className="meta">
            Draft for review: the retention period for abandoned accounts, and a
            contact route for account requests, must be decided and recorded here before
            this deployment is opened to anyone other than its operator.
          </p>
        </section>

        <section className="stack-tight">
          <h2>AI-generated explanations and their limits</h2>
          <p>
            The assistant produces text using a language model, constrained to quote
            only from passages retrieved from the source library. Citation markers that
            do not resolve to a retrieved passage are removed before display, and the
            number removed is reported to you. When retrieval is weak, the system
            declines to answer.
          </p>
          <p>
            These measures reduce the risk of unsupported statements. They do not
            eliminate it. Verified information comes from the linked source documents,
            which are the authoritative versions. Where this platform and a source
            document disagree, the source document is correct.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Third-party content and licences</h2>
          <p>
            The source library reproduces text published by other organisations. Each
            document records its publisher and licence, and those terms apply to that
            content, not to this project:
          </p>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>
              <strong>MedlinePlus, US National Library of Medicine.</strong> Mostly
              public domain as a US Government work, with some third-party content
              separately licensed. Attribution is provided.
            </li>
            <li>
              <strong>NHS, United Kingdom.</strong> Reproduced under the Open
              Government Licence v3.0, which requires attribution.
            </li>
            <li>
              <strong>World Health Organization.</strong> Reproduced under CC BY-NC-SA
              3.0 IGO. This licence permits non-commercial use only and requires
              share-alike terms on adaptations. This platform is a non-commercial
              academic project. Any commercial use of the corpus would require a
              different arrangement.
            </li>
            <li>
              <strong>UK Health Security Agency.</strong> Reproduced under the Open
              Government Licence v3.0, which requires attribution.
            </li>
            <li>
              <strong>
                NCVBDC, Ministry of Health and Family Welfare, India.
              </strong>{" "}
              Reproduced under the agency&apos;s own copyright policy rather than an open
              licence, which requires prominent acknowledgement of the source, forbids
              implying endorsement or a misleading context, and excludes material owned
              by third parties. The source is named on the document page.
            </li>
          </ul>
          <p>
            The podcasts and videos tab is different in kind: it links to, and embeds a
            player for, video content hosted by YouTube and published by the organisations
            listed there. None of that content is reproduced here, watching it is subject
            to YouTube&apos;s terms and privacy practices rather than this project&apos;s,
            and this project has not clinically reviewed it. The catalogue records which
            kind of health authority published each entry and states that limit on the tab
            and on every episode page.
          </p>
        </section>

        <section className="stack-tight">
          <h2>This project and the upstream repository</h2>
          <p>
            This platform is an independent academic project derived from the
            open-source UltimateHealth repository, which is licensed under the MIT
            licence. The original copyright notice and licence are retained.
          </p>
          <p>{SITE.nonAffiliationNotice}</p>
          <p>
            <a href={SITE.upstreamUrl} rel="noreferrer">
              Upstream repository
            </a>{" "}
            ·{" "}
            <a href={SITE.forkUrl} rel="noreferrer">
              Project fork
            </a>
          </p>
        </section>

        <section className="stack-tight">
          <h2>No warranty, and limits on liability</h2>
          <p>
            The software and its content are provided as they are, without warranty of
            any kind. The operators accept no liability for any loss arising from
            reliance on the information presented, to the extent permitted by the law
            that applies to the operator.
          </p>
          <p className="meta">
            Draft for review: the wording of this section depends on the operator&apos;s
            jurisdiction and must be reviewed by someone qualified to do so.
          </p>
        </section>

        <section className="stack-tight">
          <h2>Changes to these terms</h2>
          <p>
            If the implemented behaviour changes, this page must be updated to match it.
            See also <Link href="/privacy">the privacy policy</Link> and{" "}
            <Link href="/method">how it works</Link>.
          </p>
        </section>
      </div>
    </section>
  );
}
