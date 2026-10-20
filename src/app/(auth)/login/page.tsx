"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Orbit } from "lucide-react";

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
    <div className="flex min-h-dvh items-center justify-center surface-0 relative overflow-hidden">
      {/* Background gradient layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orbit-accent/[0.08] via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-orbit-pass/[0.03] via-transparent to-transparent" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative flex flex-col items-center gap-8 max-w-sm w-full px-6"
      >
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            className="flex items-center justify-center h-16 w-16 rounded-2xl bg-orbit-accent/10 border border-orbit-accent/20 shadow-[0_0_40px_hsl(var(--orbit-accent)/0.15)]"
          >
            <Orbit className="h-8 w-8 text-orbit-accent" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="flex flex-col items-center gap-2"
          >
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Orbit
            </h1>
            <p className="text-[13px] text-muted-foreground text-center leading-relaxed max-w-[280px]">
              AI-native testing that understands your codebase. Connect your repo,
              get a complete test suite in minutes.
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="flex flex-col gap-3 w-full"
        >
          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 text-center"
            >
              {errorMessage}
            </p>
          )}
          <Button
            onClick={() => signIn("github", { callbackUrl })}
            size="lg"
            className="w-full bg-orbit-accent text-white hover:bg-orbit-accent/90 gap-2 h-11 text-sm font-medium shadow-lg shadow-orbit-accent/20"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </Button>

          <p className="text-[11px] text-muted-foreground/70 text-center mt-2 leading-relaxed">
            Orbit requests GitHub&apos;s repo scope so it can read your code
            and post results to your pull requests.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
