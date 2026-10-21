"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Pending } from "@/components/telemetry/pending";

export interface SeatUsageData {
  seatBased: boolean;
  limit: number | null;
  members: number;
  pending: number;
}

interface SeatUsageProps {
  workspaceId: string;
  seats: SeatUsageData;
  canChangeSeats: boolean;
  onChanged: () => Promise<void>;
}

/** Seats in use (members + pending invites) and, on per-seat plans, the seat count control. */
export function SeatUsage({ workspaceId, seats, canChangeSeats, onChanged }: SeatUsageProps) {
  const [target, setTarget] = useState(seats.limit ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = seats.members + seats.pending;
  const over = seats.limit !== null && used > seats.limit;
  const full = seats.limit !== null && used >= seats.limit;

  async function saveSeats() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-workspace-id": workspaceId },
        body: JSON.stringify({ action: "set_seats", seats: target }),
      });
      const json = await res.json();
      if (!json.success) setError(json.error?.message ?? "Could not change seats");
      else await onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>
          {seats.limit === null ? "Unlimited seats" : `${used} of ${seats.limit} seats in use`}
          {" "}({seats.members} member{seats.members === 1 ? "" : "s"}, {seats.pending} pending invite{seats.pending === 1 ? "" : "s"})
        </span>
      </div>

      {over && (
        <p className="text-xs text-tm-warn">
          More members than seats. Nobody is removed, but new invites are blocked until you add seats or remove members.
        </p>
      )}
      {!over && full && seats.seatBased && (
        <p className="text-xs text-muted-foreground">All seats are in use. Add seats to invite more members.</p>
      )}

      {seats.seatBased && canChangeSeats && (
        <div className="flex items-center gap-2">
          <label htmlFor="seat-count" className="text-xs text-muted-foreground">Seats</label>
          <input
            id="seat-count"
            type="number"
            min={Math.max(1, used)}
            max={1000}
            value={target}
            onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs tabular-nums"
          />
          <button
            onClick={saveSeats}
            disabled={saving || target === seats.limit}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/85 disabled:opacity-50 transition-colors"
          >
            {saving ? <Pending /> : "Update seats"}
          </button>
          {error && <span className="text-xs text-tm-fail">{error}</span>}
        </div>
      )}
      {seats.seatBased && canChangeSeats && (
        <p className="text-[11px] text-muted-foreground">
          Added seats are invoiced now (prorated) and apply once paid. You can&apos;t go below the seats in use.
        </p>
      )}
    </div>
  );
}
