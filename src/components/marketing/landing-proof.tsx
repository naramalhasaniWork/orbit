import { ClosingO } from "@/components/telemetry/closing-o";
import { PLACEHOLDER } from "@/lib/marketing/site";

const JOURNEYS = [
  { glyph: "✕", tone: "text-tm-fail", name: "Checkout with saved card", note: " fails at step 7, “Pay”", time: "41.2s", strong: true },
  { glyph: "✓", tone: "text-tm-pass", name: "Card declined shows an error", note: "", time: "22.9s", strong: false },
  { glyph: "✓", tone: "text-tm-pass", name: "Guest checkout", note: "", time: "35.4s", strong: false },
];

/** Fig. 1: what Orbit posts on a PR. Labelled as an example until a recorded run replaces it. */
export function LandingProof() {
  return (
    <section aria-label="What Orbit posts on a pull request" className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-8">
      <figure className="grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-2">
        <div className="flex flex-col gap-3.5 border-border p-6 lg:border-r">
          <div className="flex flex-wrap items-center gap-2.5">
            <ClosingO size={20} state="failed" />
            <strong className="text-[14px] font-medium">orbit</strong>
            <span className="text-[13px] text-tm-t3">commented on PR #318 · “Lazy-load the payment iframe”</span>
          </div>
          <p className="text-[15px] font-medium tracking-[-0.01em]">
            3 journeys touched by this diff · 2 passed · <span className="text-tm-fail">1 failed</span>
          </p>
          <ul className="rounded-lg border border-border">
            {JOURNEYS.map((j) => (
              <li key={j.name} className="grid grid-cols-[18px_1fr_auto] gap-2.5 border-b border-border px-3 py-2.5 text-[13.5px] last:border-b-0">
                <span aria-hidden="true" className={`font-label text-xs ${j.tone}`}>{j.glyph}</span>
                <span>
                  {j.strong ? <strong className="font-medium">{j.name}</strong> : j.name}
                  {j.note}
                </span>
                <span className="tm-num text-[10.5px] text-tm-t3">{j.time}</span>
              </li>
            ))}
          </ul>
          <p className="text-pretty text-[14px] leading-relaxed text-tm-t2">
            The Pay button renders 1.8s before the card field is ready, so the order posts an empty token and the API
            answers 402. Introduced in <code className="font-mono text-[12.5px] text-foreground">payment.tsx:42</code>.
          </p>
          <p className="flex flex-wrap gap-4 text-[13px] text-tm-t2">
            <span>Watch the recording</span>
            <span>See the suggested fix</span>
            <span>Re-run</span>
          </p>
        </div>
        <div className="flex flex-col gap-2.5 bg-muted p-5">
          <div aria-hidden="true" className="relative grid min-h-[260px] flex-1 grid-cols-[1fr_140px] gap-6 rounded-lg border border-border bg-card px-8 py-9">
            <div className="flex flex-col gap-2.5">
              <div className="h-2.5 w-2/5 bg-tm-line" />
              <div className="h-[30px] rounded-sm border border-border" />
              <div className="h-[30px] rounded-sm border border-border" />
              <div className="tm-label flex h-[70px] items-center justify-center rounded-sm border border-dashed border-tm-line-strong text-tm-t3">
                Card field · not ready
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <div className="h-9 rounded-sm bg-primary outline outline-2 outline-offset-4 outline-tm-live" />
            </div>
            <span className="absolute bottom-[50px] right-[90px] size-2.5 rounded-full bg-tm-fail" />
          </div>
          <figcaption className="tm-label text-tm-t3">
            Fig. 1 · Example PR comment. To be replaced by step 07 of a real run against {PLACEHOLDER.demoApp}
          </figcaption>
        </div>
      </figure>
    </section>
  );
}
