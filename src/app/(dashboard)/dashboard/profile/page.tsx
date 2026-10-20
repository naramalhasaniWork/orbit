"use client";
import { Pending } from "@/components/telemetry/pending";

import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  User,
  Mail,
  Shield,
  Calendar,
  GitBranch,
  LogOut,
  Building2,
  Crown,
} from "lucide-react";

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "Unknown";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function roleBadgeStyle(role: string): string {
  const styles: Record<string, string> = {
    owner: "bg-foreground/[0.06] text-foreground border-tm-line-strong",
    admin: "bg-tm-info/15 text-tm-info border-tm-info/20",
    member: "bg-tm-pass/15 text-tm-pass border-tm-pass/20",
    viewer: "bg-tm-t3/15 text-tm-t3 border-tm-t3/20",
    billing: "bg-tm-warn/15 text-tm-warn border-tm-warn/20",
  };
  return styles[role] ?? styles.member;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full">
        <Pending label="Loading profile" showLabel />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Not authenticated</p>
      </div>
    );
  }

  const provider = session.provider ?? "github";
  const workspaceRole = session.role ?? "member";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-medium text-foreground">Profile Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your account information and preferences
        </p>
      </div>

      {/* Avatar & Identity */}
      <div className="surface-1 rounded-xl border border-border p-6">
        <div className="flex items-start gap-5">
          <div className="shrink-0">
            {session.user?.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? "Avatar"}
                width={72}
                height={72}
                className="rounded-full ring-2 ring-border"
              />
            ) : (
              <div className="h-[72px] w-[72px] rounded-full bg-foreground/[0.06] ring-2 ring-border flex items-center justify-center">
                <span className="text-2xl font-medium text-muted-foreground">
                  {session.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <h2 className="text-lg font-medium text-foreground truncate">
              {session.user?.name ?? "Unknown User"}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              {session.user?.email ?? "No email"}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border bg-foreground/[0.04] border-border text-muted-foreground capitalize">
                <GitBranch className="h-3 w-3" />
                {provider}
              </span>
              {session.userRole === "super_admin" && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-tm-fail/15 text-tm-fail border border-tm-fail/20">
                  <Shield className="h-3 w-3" />
                  Super Admin
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Account Details */}
      <div className="surface-1 rounded-xl border border-border p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Account Details</h3>

        <div className="space-y-3">
          <InfoRow
            icon={<User className="h-4 w-4" />}
            label="Display Name"
            value={session.user?.name ?? "Not set"}
            hint="Synced from your OAuth provider"
          />
          <InfoRow
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={session.user?.email ?? "Not set"}
            hint="Synced from your OAuth provider"
          />
          <InfoRow
            icon={<Calendar className="h-4 w-4" />}
            label="Account Created"
            value={formatDate(undefined)}
            hint="Joined via OAuth"
          />
          <InfoRow
            icon={<GitBranch className="h-4 w-4" />}
            label="Auth Provider"
            value={provider.charAt(0).toUpperCase() + provider.slice(1)}
          />
        </div>
      </div>

      {/* Workspace Info */}
      <div className="surface-1 rounded-xl border border-border p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Current Workspace</h3>

        <div className="space-y-3">
          <InfoRow
            icon={<Building2 className="h-4 w-4" />}
            label="Workspace"
            value={session.workspaceSlug ?? "Unknown"}
          />
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="text-muted-foreground">
                <Crown className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
              </div>
            </div>
            <span
              className={`inline-flex items-center text-xs px-2 py-0.5 rounded-md border capitalize ${roleBadgeStyle(workspaceRole)}`}
            >
              {workspaceRole}
            </span>
          </div>
        </div>
      </div>

      {/* Theme Preference (placeholder) */}
      <div className="surface-1 rounded-xl border border-border p-6 space-y-3">
        <h3 className="text-sm font-medium text-foreground">Preferences</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Theme</p>
            <p className="text-xs text-muted-foreground">Dark mode is currently the default</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-md bg-foreground/[0.04] border border-border text-muted-foreground">
            Dark
          </span>
        </div>
      </div>

      {/* Sign Out */}
      <div className="pt-2">
        <Button
          variant="outline"
          className="w-full border-tm-fail/20 text-tm-fail hover:bg-tm-fail/10 hover:text-tm-fail gap-2"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {hint && <p className="text-[10px] text-muted-foreground/60">{hint}</p>}
        </div>
      </div>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
