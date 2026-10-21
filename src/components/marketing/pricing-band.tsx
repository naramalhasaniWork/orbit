import Link from "next/link";
import { getTierConfig } from "@/lib/stripe/prices";
import { PLACEHOLDER } from "@/lib/marketing/site";

interface BandTier {
  label: string;
  price: string;
  unit?: string;
  note?: string;
  body: string;
}

// Prices come from the billing config so the page always matches what Stripe charges.
function bandTiers(): BandTier[] {
  const pro = getTierConfig("starter");
  const team = getTierConfig("professional");
  const annual = (n: number | null) => (n ? `$${n}/seat/mo billed annually` : undefined);
  return [
    { label: "Self-hosted", price: "Free", body: "The open-source core on your infrastructure, with your model key. No usage limits." },
    { label: pro.name, price: `$${pro.priceMonthly}`, unit: " / seat / mo", note: annual(pro.priceAnnual), body: "Managed browsers and model, GitHub, Linear and Slack." },
    { label: team.name, price: `$${team.priceMonthly}`, unit: " / seat / mo", note: annual(team.priceAnnual), body: "Roles and permissions, audit logs, priority support." },
    { label: getTierConfig("enterprise").name, price: "Contact", body: "Dedicated infrastructure, data residency and an SLA." },
  ];
}

/** The pricing band: per seat, read from prices.ts; cost per run stays a visible placeholder until measured. */
export function PricingBand({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;
  return (
    <section id="pricing" className="scroll-mt-6 border-t border-border bg-card">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-16 sm:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Heading className="text-balance text-[34px] font-medium leading-[1.05] tracking-[-0.035em]">
            Free to run yourself. Priced per seat when we run it.
          </Heading>
          <p className="text-pretty text-[16px] leading-relaxed text-tm-t2">
            Plans include monthly credits for model calls and browser minutes. Unused credits roll over for one month.
            Cost per run: <span className="tm-num">{PLACEHOLDER.measured}</span>, published from real runs.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {bandTiers().map((t) => (
            <div key={t.label} className="flex flex-col gap-2.5 border-t border-foreground py-5 pr-6">
              <span className="tm-label text-tm-t3">{t.label}</span>
              <span className="tm-num text-[26px] tracking-[-0.02em]">
                {t.price}
                {t.unit && <span className="font-sans text-[13px] tracking-normal text-tm-t3">{t.unit}</span>}
              </span>
              {t.note && <span className="tm-label text-tm-t3">{t.note}</span>}
              <span className="text-pretty text-[14px] leading-relaxed text-tm-t2">{t.body}</span>
            </div>
          ))}
        </div>
        {headingLevel === "h2" && (
          <Link href="/pricing" className="w-fit text-[14px] text-tm-t2 underline decoration-tm-line-strong underline-offset-4 hover:text-foreground">
            Plan details and limits
          </Link>
        )}
      </div>
    </section>
  );
}
