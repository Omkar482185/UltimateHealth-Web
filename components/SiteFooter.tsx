import { NavLink } from "@/components/NavLink";
import { SITE } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <span className="brand__name">{SITE.title}</span>
            <p>{SITE.tagline}</p>
          </div>
          <p className="site-footer__statement">
            A fixed corpus of public health guidance, hybrid retrieval, and a citation
            on every claim. When the evidence does not cover a question, the platform
            says so.
          </p>
        </div>

        <div className="site-footer__grid">
          <div>
            <h2>Platform</h2>
            <ul>
              <li>
                <NavLink href="/assistant">Health assistant</NavLink>
              </li>
              <li>
                <NavLink href="/guidance">Symptom guidance</NavLink>
              </li>
              <li>
                <NavLink href="/community">Peer community</NavLink>
              </li>
              <li>
                <NavLink href="/community/guidelines">Community guidelines</NavLink>
              </li>
              <li>
                <NavLink href="/library">Source library</NavLink>
              </li>
              <li>
                <NavLink href="/podcasts">Podcasts and videos</NavLink>
              </li>
            </ul>
          </div>
          <div>
            <h2>Your health</h2>
            <ul>
              <li>
                <NavLink href="/dashboard">Dashboard</NavLink>
              </li>
              <li>
                <NavLink href="/records">Measurements</NavLink>
              </li>
              <li>
                <NavLink href="/account">Account and data</NavLink>
              </li>
            </ul>
          </div>
          <div>
            <h2>Reference</h2>
            <ul>
              <li>
                <NavLink href="/method">How it works and limitations</NavLink>
              </li>
              <li>
                <NavLink href="/chikungunya">Chikungunya</NavLink>
              </li>
              <li>
                <NavLink href="/privacy">Privacy policy</NavLink>
              </li>
              <li>
                <NavLink href="/terms">Terms of service</NavLink>
              </li>
            </ul>
          </div>
          <div>
            <h2>About this project</h2>
            <p className="site-footer__about">
              An academic project derived from the open-source{" "}
              <a href={SITE.upstreamUrl} rel="noreferrer">
                UltimateHealth
              </a>{" "}
              repository, which is MIT licensed. {SITE.nonAffiliationNotice}
            </p>
          </div>
        </div>

        <div className="site-footer__fineprint">
          <p>
            This platform provides general health education. It does not provide medical
            diagnosis or treatment, and it does not replace assessment by a qualified
            health professional. In an emergency, contact your local emergency number.
          </p>
          <p className="mono">Source-grounding · No diagnosis · No dosing</p>
        </div>
      </div>
    </footer>
  );
}
