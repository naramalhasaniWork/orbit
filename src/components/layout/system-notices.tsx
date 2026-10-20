import { Megaphone, Wrench } from "lucide-react";

const DEFAULT_MAINTENANCE_MESSAGE =
  "Orbit is down for scheduled maintenance. Your projects and runs are safe; check back shortly.";

/** Full-screen stand-in for the dashboard while maintenance mode is on. */
export function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center surface-0 px-4">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border surface-1">
          <Wrench className="h-5 w-5 text-foreground" />
        </div>
        <h1 className="text-lg font-medium text-foreground">Down for maintenance</h1>
        <p className="text-sm text-muted-foreground">{message || DEFAULT_MAINTENANCE_MESSAGE}</p>
      </div>
    </div>
  );
}

interface SystemBannerProps {
  announcement: string;
  /** Admins still get in during maintenance; remind them it's on. */
  maintenanceActiveForAdmin: boolean;
}

export function SystemBanner({ announcement, maintenanceActiveForAdmin }: SystemBannerProps) {
  if (!announcement && !maintenanceActiveForAdmin) return null;
  return (
    <div className="border-b border-border">
      {maintenanceActiveForAdmin && (
        <div role="status" className="flex items-center gap-2 bg-orbit-fail/10 px-4 py-1.5 text-xs text-foreground">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-orbit-fail" />
          Maintenance mode is on. Only super admins can use the app.
        </div>
      )}
      {announcement && (
        <div role="status" className="flex items-center gap-2 bg-foreground/[0.06] px-4 py-1.5 text-xs text-foreground">
          <Megaphone className="h-3.5 w-3.5 shrink-0 text-foreground" />
          {announcement}
        </div>
      )}
    </div>
  );
}
