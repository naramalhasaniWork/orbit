import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { PLACEHOLDER, SITE } from "@/lib/marketing/site";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/#self-host", label: "Self-host" },
  { href: "/pricing", label: "Pricing" },
];

/** Static header: no scroll listener, no blur. Wraps instead of hiding links on small screens. */
export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-7 gap-y-3 px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Orbit home" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo size="md" brand />
        </Link>
        <nav aria-label="Main" className="order-3 flex w-full gap-5 overflow-x-auto text-[14px] sm:order-none sm:w-auto">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} className="shrink-0 text-tm-t2 hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <a
            href={SITE.repoUrl}
            className="tm-label hidden h-[34px] items-center rounded-md border border-border bg-card px-2.5 text-tm-t2 hover:text-foreground sm:inline-flex"
          >
            GitHub ★ {PLACEHOLDER.stars}
          </a>
          <Link
            href="/login"
            className="inline-flex h-[34px] items-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
