"use client";

import { useState } from "react";
import { Send, Copy, Check, X, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expiresAt: string;
  invitedBy: { name: string | null };
}

interface InviteFormProps {
  workspaceId: string;
  invitations: Invitation[];
  onInvite: (email: string, role: string) => Promise<{ token?: string } | null>;
  onRevoke: (invitationId: string) => Promise<void>;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "billing", label: "Billing" },
];

export function InviteForm({ workspaceId, invitations, onInvite, onRevoke }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    setLastToken(null);

    try {
      const result = await onInvite(email.trim(), role);
      if (result?.token) {
        setLastToken(result.token);
        setEmail("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="invite-email" className="text-xs text-muted-foreground mb-1.5 block">
              Email Address
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-32">
            <Label htmlFor="invite-role" className="text-xs text-muted-foreground mb-1.5 block">
              Role
            </Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-foreground"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={loading || !email.trim()}
              size="sm"
              className="h-9 gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Invite
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {lastToken && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-orbit-accent/10 border border-orbit-accent/20">
            <span className="text-xs text-orbit-accent flex-1">
              Invitation created. Share this link:
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => copyInviteLink(lastToken)}
            >
              {copiedToken === lastToken ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copiedToken === lastToken ? "Copied" : "Copy Link"}
            </Button>
          </div>
        )}
      </form>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pending Invitations
          </h4>
          <div className="space-y-1">
            {pendingInvitations.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();

              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">
                        {inv.email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm text-foreground truncate block">
                        {inv.email}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {inv.role}
                        </span>
                        {expired ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-400 border-red-400/20">
                            Expired
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Expires {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => copyInviteLink(inv.token)}
                      title="Copy invite link"
                    >
                      {copiedToken === inv.token ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                      onClick={() => onRevoke(inv.id)}
                      title="Revoke invitation"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
