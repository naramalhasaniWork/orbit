import { LINKS, SITE } from "@/lib/marketing/site";

/** One-shot reveal at most: the headline settles once; nothing loops. */
export function LandingHero() {
  return (
    <section className="mx-auto grid max-w-[1240px] grid-cols-1 items-end gap-12 px-4 pb-10 pt-16 sm:px-8 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <span className="tm-label text-tm-t3">
          AI QA for pull requests · <span className="whitespace-nowrap">Open source (AGPL-3.0)</span>
        </span>
        <h1 className="text-balance text-[clamp(44px,6.2vw,80px)] font-medium leading-[0.94] tracking-[-0.05em] motion-safe:animate-slide-up">
          {SITE.headline}
        </h1>
      </div>
      <div className="flex flex-col gap-5 pb-2">
        <p className="text-pretty text-[18px] leading-relaxed text-tm-t2">
          Orbit reads the diff, works out which user journeys it touches, and walks them in a real browser on your
          preview deployment. What broke lands on the PR in plain English, with the recording and the line that
          caused it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={LINKS.railwayGuide}
            className="inline-flex h-[46px] items-center rounded-md bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Deploy on Railway
          </a>
          <code className="inline-flex h-[46px] items-center rounded-md bg-muted px-4 font-mono text-[13px] text-tm-t2">
            docker compose up
          </code>
        </div>
        <span className="text-[13px] text-tm-t3">Your code, your browsers, your model key. Nothing leaves your infrastructure.</span>
      </div>
    </section>
  );
}
