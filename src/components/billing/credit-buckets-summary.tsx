import { cn } from "@/lib/utils";

export interface CreditBucketsData {
  current: number;
  rollover: number;
  purchased: number;
  rolloverExpiresAt: string | null;
}

/** The three credit buckets, in the order runs spend them. */
export function CreditBucketsSummary({ credits }: { credits: CreditBucketsData }) {
  const expiry = credits.rolloverExpiresAt
    ? new Date(credits.rolloverExpiresAt).toLocaleDateString()
    : null;
  const buckets = [
    {
      label: "Rolled over",
      value: credits.rollover,
      note: credits.rollover > 0 && expiry ? `Expires ${expiry}` : "Last month's unused credits",
    },
    { label: "This month", value: credits.current, note: "Unused credits roll over for one month" },
    { label: "Purchased", value: credits.purchased, note: "Never expire" },
  ];

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-lg bg-muted/40 px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{b.label}</dt>
            <dd className={cn("text-sm font-medium tabular-nums", b.value < 0 ? "text-tm-fail" : "text-foreground")}>
              {b.value.toLocaleString()}
            </dd>
            <dd className="text-[11px] text-muted-foreground mt-0.5">{b.note}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-muted-foreground mt-2">
        Runs spend rolled-over credits first, then this month&apos;s, then purchased.
      </p>
    </div>
  );
}
