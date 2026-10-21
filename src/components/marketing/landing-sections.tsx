import { LINKS } from "@/lib/marketing/site";

const STEPS = [
  { n: "01 · Map", title: "Read the code", body: "Routes, components, API calls and data models become a dependency graph, rebuilt on every push." },
  { n: "02 · Scope", title: "Trace the diff", body: "Changed files are walked up the graph to the journeys a user would notice." },
  { n: "03 · Run", title: "Walk the preview", body: "A real Chromium clicks through each journey on your Railway or Cloudflare preview." },
  { n: "04 · Explain", title: "Say what broke", body: "Cause, evidence and a suggested fix, posted as one PR check. Passing runs stay quiet." },
  { n: "05 · Replay", title: "Keep what passed", body: "Passing steps are saved and replayed without a model call, so the next PR costs less." },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto flex max-w-[1240px] scroll-mt-6 flex-col gap-7 px-4 pb-20 sm:px-8">
      <div className="grid grid-cols-1 gap-6 border-t border-foreground pt-5 lg:grid-cols-2">
        <h2 className="text-balance text-[34px] font-medium leading-[1.05] tracking-[-0.035em]">One pass per pull request.</h2>
        <p className="text-pretty text-[16px] leading-relaxed text-tm-t2">
          No test suite to write first. Orbit maps your app from the code once, then on every PR it tests only what
          the change can reach, riskiest first.
        </p>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s) => (
          <li key={s.n} className="flex flex-col gap-2 border-t border-border py-5 pr-6">
            <span className="tm-label text-tm-t3">{s.n}</span>
            <strong className="text-[16px] font-medium">{s.title}</strong>
            <span className="text-pretty text-[14px] leading-relaxed text-tm-t2">{s.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const SCOPE_ROWS: { label: string; values: string[]; muted?: boolean }[] = [
  { label: "Changed", values: ["src/app/checkout/payment.tsx"] },
  { label: "Component", values: ["PaymentForm"] },
  { label: "Used by", values: ["/checkout", "/settings/billing"] },
  { label: "Journeys", values: ["Checkout with saved card", "Guest checkout", "Change billing plan"] },
  { label: "Skipped", values: ["209 test cases the diff can't reach"], muted: true },
];

export function DiffToJourneys() {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-4 py-16 sm:px-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <span className="tm-label text-tm-t3">Fig. 2 · From diff to journeys (example)</span>
          <h2 className="text-balance text-[34px] font-medium leading-[1.05] tracking-[-0.035em]">
            One changed file. Three journeys worth checking. Not 212.
          </h2>
          <p className="text-pretty text-[16px] leading-relaxed text-tm-t2">
            Most of a test suite has nothing to do with a given PR. Orbit runs the part that does, so a check finishes
            in minutes and a red result means something.
          </p>
        </div>
        <dl className="self-center">
          {SCOPE_ROWS.map((r) => (
            <div key={r.label} className="grid grid-cols-[110px_1fr] gap-4 border-t border-border py-3 first:border-t-0">
              <dt className="tm-label pt-1 text-tm-t3">{r.label}</dt>
              <dd className="flex flex-wrap gap-2">
                {r.values.map((v) =>
                  r.muted ? (
                    <span key={v} className="text-[14px] text-tm-t3">{v}</span>
                  ) : (
                    <span key={v} className="rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[12.5px]">{v}</span>
                  )
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const OWNED = [
  { term: "Your code", body: "Read through your GitHub App, indexed into your Postgres. Never sent anywhere else." },
  { term: "Your model key", body: "Anthropic, OpenAI or OpenRouter. You see every token on your own bill." },
  { term: "Your test credentials", body: "Encrypted at rest. The model sees a placeholder; the real value is typed in by the browser only." },
  { term: "Your previews", body: "Railway PR environments and Cloudflare Pages previews, including ones behind Cloudflare Access." },
];

export function SelfHost() {
  return (
    <section id="self-host" className="mx-auto grid max-w-[1240px] scroll-mt-6 grid-cols-1 gap-10 px-4 py-20 sm:px-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className="text-balance text-[34px] font-medium leading-[1.05] tracking-[-0.035em]">Runs on your infrastructure.</h2>
        <p className="text-pretty text-[16px] leading-relaxed text-tm-t2">
          Orbit is one web service, Postgres, Redis and a headless browser. Deploy it, paste a GitHub App and a model
          key, and the first sign-in becomes the admin.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={LINKS.railwayGuide} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[14px] font-medium text-primary-foreground hover:bg-primary/85">
            Deploy on Railway
          </a>
          <a href={LINKS.selfHosting} className="inline-flex h-10 items-center rounded-md border border-tm-line-strong px-4 text-[14px] font-medium hover:bg-accent">
            Self-hosting guide
          </a>
        </div>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2">
        {OWNED.map((o) => (
          <div key={o.term} className="flex flex-col gap-2 border-t border-border py-5 pr-6">
            <dt className="tm-label text-tm-t3">{o.term}</dt>
            <dd className="text-pretty text-[14px] leading-relaxed">{o.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
