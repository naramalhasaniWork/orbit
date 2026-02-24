"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Orbit, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InvitationInfo {
  email: string;
  role: string;
  workspaceName: string;
  invitedByName: string | null;
  expiresAt: string;
  expired: boolean;
}

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const res = await fetch(`/api/invitations/${token}/accept`);
        const json = await res.json();
        if (json.success) {
          setInvitation(json.data);
        } else if (
          json.error?.code === "INVITATION_INVALID" &&
          session
        ) {
          // Invitation was already accepted (e.g. auto-accepted during login)
          setSuccess(true);
          setTimeout(() => router.push("/dashboard"), 2000);
        } else {
          setError(json.error?.message ?? "Invalid invitation");
        }
      } catch {
        setError("Failed to load invitation");
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchInvitation();
  }, [token, session, router]);

  async function handleAccept() {
    if (!session) {
      router.push(`/login?callbackUrl=/invite/${token}`);
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const json = await res.json();

      if (json.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      } else {
        setError(json.error?.message ?? "Failed to accept invitation");
      }
    } catch {
      setError("Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  }

  if (loading || authStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center surface-0">
        <Loader2 className="h-6 w-6 text-orbit-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center surface-0 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-orbit-accent/15 flex items-center justify-center">
            <Orbit className="h-6 w-6 text-orbit-accent" />
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 space-y-4">
          {error && !invitation && (
            <div className="text-center space-y-3">
              <XCircle className="h-10 w-10 text-red-400 mx-auto" />
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="ghost" onClick={() => router.push("/login")}>
                Go to Login
              </Button>
            </div>
          )}

          {invitation && !success && (
            <>
              <div className="text-center space-y-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Join {invitation.workspaceName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {invitation.invitedByName
                    ? `${invitation.invitedByName} invited you`
                    : "You've been invited"}{" "}
                  to join as{" "}
                  <span className="font-medium text-foreground capitalize">
                    {invitation.role}
                  </span>
                </p>
              </div>

              {invitation.expired ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-400/10 border border-red-400/20">
                  <Clock className="h-4 w-4 text-red-400 shrink-0" />
                  <span className="text-sm text-red-400">
                    This invitation has expired.
                  </span>
                </div>
              ) : (
                <>
                  <div className="text-center text-xs text-muted-foreground">
                    Invitation for <strong>{invitation.email}</strong>
                    {" -- "}
                    Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </div>

                  {error && (
                    <p className="text-xs text-red-400 text-center">{error}</p>
                  )}

                  {!session ? (
                    <Button
                      className="w-full"
                      onClick={() => router.push(`/login?callbackUrl=/invite/${token}`)}
                    >
                      Sign in to Accept
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-orbit-accent hover:bg-orbit-accent/90"
                      onClick={handleAccept}
                      disabled={accepting}
                    >
                      {accepting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Accept Invitation
                    </Button>
                  )}
                </>
              )}
            </>
          )}

          {success && (
            <div className="text-center space-y-3">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto" />
              <p className="text-sm text-foreground">
                You&apos;ve joined the workspace.
              </p>
              <p className="text-xs text-muted-foreground">
                Redirecting to dashboard...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
