"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A link that knows whether it points at the page being viewed.
 *
 * Both the header and the footer link to the same routes, so the rule for what
 * counts as "current" lives here rather than being written twice and drifting. The
 * home route is matched exactly: every path starts with `/`, so a prefix match would
 * mark Home as current on every page.
 *
 * `aria-current="page"` is what a screen reader announces as the current page. It is
 * emitted on whichever link matches, so a reader on a policy page, which is reachable
 * only from the footer, is told where they are just as clearly as a reader on a page
 * that appears in the main navigation.
 */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      className={className}
      href={href}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
