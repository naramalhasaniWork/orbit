"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const LOGIN_ERRORS: Record<string, string> = {
  SignupInviteOnly: "This instance is invite-only. Ask a workspace admin to invite you, then sign in again.",
  SignupClosed: "New sign-ups are disabled on this instance.",
  EmailDomainNotAllowed: "Your email domain is not allowed to sign in to this instance.",
  RateLimited: "Too many sign-in attempts. Wait a few minutes and try again.",
  AccessDenied: "Access denied. Your account is not allowed to sign in.",
};

function isRelativePath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl");
  const callbackUrl =
    rawCallback && isRelativePath(rawCallback) ? rawCallback : "/dashboard";
  const errorCode = searchParams.get("error");
  const errorMessage = errorCode
    ? (LOGIN_ERRORS[errorCode] ?? "Sign-in failed. Please try again.")
    : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-start gap-5">
          <Logo size="lg" brand />
          <div className="space-y-2">
            <h1 className="text-balance text-[26px] font-medium leading-tight tracking-display">Sign in to Orbit</h1>
            <p className="text-pretty text-[14px] leading-relaxed text-muted-foreground">
              Point it at a GitHub repo and it tests the app for you: riskiest journeys first, in a real
              browser, with what broke explained in plain English.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          {errorMessage && (
            <p
              role="alert"
              className="rounded-md border border-tm-fail/30 bg-tm-fail-bg px-3 py-2 text-[13px] text-tm-fail"
            >
              <span aria-hidden="true">✕ </span>
              {errorMessage}
            </p>
          )}
          <Button
            onClick={() => signIn("github", { callbackUrl })}
            size="lg"
            className="w-full"
          >
            <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </Button>

          <p className="text-pretty text-[12px] leading-relaxed text-tm-t3">
            Orbit requests GitHub&apos;s repo scope so it can read your code
            and post results to your pull requests.
          </p>
        </div>
      </div>
    </main>
  );
}
