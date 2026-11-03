"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NavLink } from "@/components/NavLink";
import { SITE } from "@/lib/config";

/**
 * Primary destinations. Kept short on purpose: the header should suggest where a
 * reader can go without becoming an index of the product. Everything else lives
 * in the "Your health" menu, the mobile menu, or the footer.
 */
const PRIMARY = [
  { href: "/assistant", label: "Assistant" },
  { href: "/guidance", label: "Symptom guidance" },
  { href: "/chikungunya", label: "Chikungunya" },
  { href: "/community", label: "Community" },
  { href: "/library", label: "Library" },
  { href: "/podcasts", label: "Podcasts" },
];

/** Personal screens, grouped because they describe one person's own data. */
const PERSONAL = [
  { href: "/dashboard", label: "Dashboard", hint: "Your numbers and next steps" },
  { href: "/records", label: "Health records", hint: "Readings you recorded" },
  { href: "/account", label: "Account", hint: "Profile, export and deletion" },
];

/** Reference and policy pages, shown in the mobile menu and footer. */
const SECONDARY = [
  { href: "/method", label: "How it works" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [personalOpen, setPersonalOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const personalRef = useRef<HTMLDivElement | null>(null);

  // Navigating anywhere closes both menus: an open panel over a new page reads as
  // a stuck menu rather than as navigation.
  useEffect(() => {
    setPersonalOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!personalOpen) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!personalRef.current?.contains(event.target as Node)) {
        setPersonalOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPersonalOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [personalOpen]);

  const personalActive = PERSONAL.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <>
      {/* The wordmark is the home link, so it carries the current-page marker on
          the home page: the navigation has no separate "Home" entry, and without
          this the home page would show no indication of where the reader is. */}
      <NavLink className="brand" href="/">
        <SiteMark />
        <span className="brand__text">
          <span className="brand__name">{SITE.shortTitle}</span>
          <span className="brand__tagline">Evidence-led health</span>
        </span>
      </NavLink>

      <nav className="nav" aria-label="Main">
        {PRIMARY.map((link) => (
          <NavLink key={link.href} className="nav__link" href={link.href}>
            {link.label}
          </NavLink>
        ))}

        <div className="dropdown" ref={personalRef}>
          <button
            type="button"
            className="dropdown__trigger"
            data-active={personalActive ? "true" : undefined}
            aria-expanded={personalOpen}
            aria-controls="personal-menu"
            onClick={() => setPersonalOpen((open) => !open)}
          >
            Your health
            <span className="dropdown__caret" aria-hidden="true" />
          </button>
          {personalOpen ? (
            <div className="dropdown__panel" id="personal-menu" aria-label="Your health">
              {PERSONAL.map((link) => (
                <NavLink key={link.href} href={link.href}>
                  {link.label}
                  <span>{link.hint}</span>
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="nav__actions">
        <Link className="btn btn--primary btn--small" href="/guidance">
          Start symptom check
        </Link>
      </div>

      <button
        type="button"
        className="nav__toggle"
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation"
        onClick={() => setMobileOpen((open) => !open)}
      >
        <span className="nav__toggle-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {mobileOpen ? "Close" : "Menu"}
      </button>

      {mobileOpen ? (
        <div className="mobile-nav" id="mobile-navigation">
          <div className="container">
            <div className="mobile-nav__group">
              <p className="mobile-nav__label">Learn and check</p>
              <ul>
                {PRIMARY.map((link) => (
                  <li key={link.href}>
                    <NavLink href={link.href}>{link.label}</NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mobile-nav__group">
              <p className="mobile-nav__label">Your health</p>
              <ul>
                {PERSONAL.map((link) => (
                  <li key={link.href}>
                    <NavLink href={link.href}>{link.label}</NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mobile-nav__group">
              <p className="mobile-nav__label">Reference</p>
              <ul>
                {SECONDARY.map((link) => (
                  <li key={link.href}>
                    <NavLink href={link.href}>{link.label}</NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mobile-nav__footer">
              <Link className="btn btn--primary" href="/guidance">
                Start the symptom check
              </Link>
              <Link className="btn" href="/assistant">
                Ask the health assistant
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * A simple mark: a pulse line inside a bracket, drawn as plain SVG rather than
 * pulled from an icon set so there is no third-party icon dependency in the
 * header.
 */
function SiteMark() {
  return (
    <svg
      className="brand__mark"
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${SITE.shortTitle} home`}
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="6"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
      <path
        d="M4 13h3.2l1.6-4.2 2.6 8 1.9-5 1.3 1.2H20"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
