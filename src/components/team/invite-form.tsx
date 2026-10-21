"use client";

import { useState } from "react";
import { Send, Copy, Check, X, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
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

interface InviteResult {
  token?: string;
  emailSent?: boolean;
}

interface InviteFormProps {
  workspaceId: string;
  invitations: Invitation[];
  onInvite: (email: string, role: string) => Promise<InviteResult | null>;
  onResend: (invitationId: string) => Promise<InviteResult | null>;
  onRevoke: (invitationId: string) => Promise<void>;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "billing", label: "Billing" },
];

export function InviteForm({ invitations, onInvite, onResend, onRevoke }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState<{ to: string; sent: boolean } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    setLastToken(null);
    setLastEmail(null);

    try {
      const to = email.trim();
      const result = await onInvite(to, role);
      if (result?.token) {
        setLastToken(result.token);
        setLastEmail({ to, sent: Boolean(result.emailSent) });
        setEmail("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(invitation: Invitation) {
    setResendingId(invitation.id);
    setError(null);
    try {
      const result = await onResend(invitation.id);
      if (result?.token) {
        setLastToken(result.token);
        setLastEmail({ to: invitation.email, sent: Boolean(result.emailSent) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend invitation");
    } finally {
      setResendingId(null);
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
              className="h-9 w-full rounded-md border border-border bg-muted/30 px-3 text-sm text-foreground"
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
          <p className="text-xs text-tm-fail">{error}</p>
        )}

        {lastToken && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-foreground/[0.06] border border-tm-line-strong">
            <span className="text-xs text-foreground flex-1">
              {lastEmail?.sent
                ? `Email sent to ${lastEmail.to}. You can also share the link:`
                : "Email not sent. Share this link instead:"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => copyInviteLink(lastToken)}
            >
              {copiedToken === lastToken ? (
                <Check className="h-3 w-3 text-tm-pass" />
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
          <h4 className=" text-muted-foreground tm-label">
            Pending Invitations
          </h4>
          <div className="space-y-1">
            {pendingInvitations.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();

              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar email={inv.email} size="md" decorative />
                    <div className="min-w-0">
                      <span className="text-sm text-foreground truncate block">
                        {inv.email}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {inv.role}
                        </span>
                        {expired ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-tm-fail border-tm-fail/20">
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
                        <Check className="h-3.5 w-3.5 text-tm-pass" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleResend(inv)}
                      disabled={resendingId === inv.id}
                      title="Resend invitation (issues a new link)"
                    >
                      <RotateCcw className={cn("h-3.5 w-3.5")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-tm-fail hover:text-tm-fail"
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
