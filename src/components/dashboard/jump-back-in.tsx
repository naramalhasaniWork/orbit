"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/telemetry/status";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { useShortcutTrigger } from "@/components/shortcuts/shortcut-provider";
import type { JumpItem } from "@/lib/dashboard/launchpad-shape";

const KIND_LABEL: Record<JumpItem["kind"], string> = { run: "Run", plan: "Plan", node: "Map" };

/**
 * Run, Plan, Map, Connect: the four things people open the home page to do. Run goes through the
 * header's gate (environment, plan) and its error; a project still setting up has no run action, so finish setup.
 */
function QuickActions({ projectId }: { projectId: string }) {
  const trigger = useShortcutTrigger();
  const router = useRouter();
  const q = `?project=${projectId}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" onClick={() => trigger("run") || router.push(`/dashboard/onboarding${q}`)}>
        <Play aria-hidden="true" className="size-3.5" />
        Run
      </Button>
      <Button size="sm" variant="outline" asChild>
        <Link href={`/dashboard/plans${q}`}>Plan</Link>
      </Button>
      <Button size="sm" variant="outline" asChild>
        <Link href={`/dashboard/map${q}`}>Map</Link>
      </Button>
      <Button size="sm" variant="outline" asChild>
        <Link href="/dashboard/settings?tab=integrations">Connect integration</Link>
      </Button>
      <button
        type="button"
        onClick={() => trigger("palette")}
        className="ml-auto flex items-center gap-1.5 rounded-sm px-1 text-[12px] text-tm-t3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ShortcutKeys id="palette" />
        <span>for everything else</span>
      </button>
    </div>
  );
}

/** The five most recent things that need attention across runs, plans and the map, and the quick actions. */
export function JumpBackIn({ items, projectId }: { items: JumpItem[]; projectId: string }) {
  return (
    <section aria-labelledby="jump-back-in" className="flex flex-col gap-3 px-5 py-5">
      <h2 id="jump-back-in" className="text-[14px] font-medium">Jump back in</h2>
      <QuickActions projectId={projectId} />
      {items.length === 0 ? (
        <p className="border-t border-border pt-3 text-[13px] text-tm-t3">Nothing waiting on you. Start a run to see it here.</p>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.key}>
              <Link
                href={i.href}
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-t border-border py-2.5 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {/* The detail line says the state in words; the glyph is for the eye. */}
                <span aria-hidden="true">
                  <Status tone={i.tone} glyphOnly />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{i.title}</span>
                  <span className="block truncate text-[12px] text-tm-t2">{i.detail}</span>
                </span>
                <span className="text-right">
                  <span className="tm-label block text-tm-t3">{KIND_LABEL[i.kind]}</span>
                  <span className="tm-num block text-[10.5px] text-tm-t3">{formatDistanceToNowStrict(new Date(i.at))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
