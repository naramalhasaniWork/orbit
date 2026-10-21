import Link from "next/link";
import { ArrowLeft, Lock, Shield, Server, Users, Eye, FileKey, Bug } from "lucide-react";

export const metadata = {
  title: "Security · Orbit",
  description:
    "How Orbit protects your source code, credentials, and data. Our security architecture explained.",
};

interface SecuritySectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function SecuritySection({ icon, title, children }: SecuritySectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orbit-accent/10 border border-orbit-accent/20">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold mb-2">{title}</h3>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <div className="pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 mb-6">
            <Lock className="h-7 w-7 text-orbit-accent" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Security</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Orbit processes your source code and interacts with your staging
            environments. We take that responsibility seriously. Here is
            exactly how we protect your data.
          </p>
        </div>

        <div className="mt-12 space-y-6">
          <SecuritySection
            icon={<Shield className="h-5 w-5 text-orbit-accent" />}
            title="Encryption at Rest and In Transit"
          >
            <p>
              All data is encrypted in transit using TLS 1.3. At rest, database
              storage is encrypted via the hosting provider&apos;s disk
              encryption. Secrets stored in Orbit&apos;s vault (API keys, staging
              credentials, environment variables) are encrypted using
              AES-256-GCM with unique initialization vectors per secret.
              Secrets are never logged, never displayed in plaintext in the UI,
              and are decrypted only at the moment of test execution.
            </p>
          </SecuritySection>

          <SecuritySection
            icon={<Server className="h-5 w-5 text-orbit-accent" />}
            title="Ephemeral Test Execution"
          >
            <p>
              Browser tests run in isolated, ephemeral sessions via Playwright.
              Each test run gets a clean browser context that is destroyed after
              execution completes. No persistent browser state, cookies, or
              sessions carry over between runs. When using cloud browsers
              (Browserbase), sessions are fully sandboxed and terminated on
              completion.
            </p>
          </SecuritySection>

          <SecuritySection
            icon={<Users className="h-5 w-5 text-orbit-accent" />}
            title="Tenant Isolation"
          >
            <p>
              Every database table includes a <code className="text-xs bg-foreground/5 px-1.5 py-0.5 rounded">workspaceId</code> column
              enforcing strict row-level tenant isolation. No API endpoint can
              access data from a workspace the authenticated user does not
              belong to. Source code, test results, embeddings, and secrets are
              completely isolated between workspaces.
            </p>
          </SecuritySection>

          <SecuritySection
            icon={<FileKey className="h-5 w-5 text-orbit-accent" />}
            title="Webhook Verification"
          >
            <p>
              All incoming webhooks (GitHub push events, PR events) are verified
              using HMAC-SHA256 signature validation before processing. Webhooks
              without a valid signature are rejected. Outgoing webhook payloads
              to your integrations (Slack, Linear) are sent over HTTPS and
              contain only the minimum data necessary.
            </p>
          </SecuritySection>

          <SecuritySection
            icon={<Eye className="h-5 w-5 text-orbit-accent" />}
            title="AI Provider Data Handling"
          >
            <p>
              Code snippets are sent to Anthropic and OpenAI for analysis under
              their respective API agreements, which prohibit using API inputs
              for model training. We send only the minimum context needed for
              each task (not your full repository). AI provider interactions are
              logged for debugging but do not include raw source code in
              persistent logs.
            </p>
          </SecuritySection>

          <SecuritySection
            icon={<Shield className="h-5 w-5 text-orbit-accent" />}
            title="Authentication and Access"
          >
            <p>
              Orbit uses GitHub OAuth for authentication with JWT-based session
              tokens. Repository access is scoped to the permissions you grant.
              You can revoke Orbit&apos;s access at any time from your GitHub
              settings, which immediately disables repository syncing.
            </p>
          </SecuritySection>

          <SecuritySection
            icon={<Server className="h-5 w-5 text-orbit-accent" />}
            title="Infrastructure"
          >
            <p>
              Orbit runs on Railway&apos;s infrastructure in the United States.
              The database (PostgreSQL) and application are hosted in Railway&apos;s
              managed environment with automated backups, network isolation, and
              encrypted storage. All services communicate over private internal
              networks where possible.
            </p>
          </SecuritySection>

          <SecuritySection
            icon={<Bug className="h-5 w-5 text-orbit-accent" />}
            title="Responsible Disclosure"
          >
            <p>
              If you discover a security vulnerability in Orbit, we ask that you
              report it responsibly. Please email{" "}
              <a href="mailto:naram@hey.com" className="text-orbit-accent hover:underline">
                naram@hey.com
              </a>{" "}
              with details of the vulnerability. Do not publicly disclose the
              issue until we have had a chance to investigate and address it.
              We commit to acknowledging reports within 48 hours and providing
              a resolution timeline within 5 business days.
            </p>
          </SecuritySection>
        </div>

        <div className="mt-12 rounded-xl border border-border bg-card p-6">
          <h3 className="font-semibold mb-2">Compliance Roadmap</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Orbit is an early-stage product and does not currently hold SOC 2
            or ISO 27001 certifications. As we grow, formal compliance
            certifications are on our roadmap. Enterprise customers with
            specific security requirements can reach out to discuss custom
            arrangements including dedicated infrastructure, audit logs, and
            data residency options.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-orbit-accent hover:text-orbit-accent/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
