import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

export const metadata = {
  title: "Security - Orbit",
  description: "How Orbit protects your code and data.",
};

export default function SecurityPage() {
  return (
    <div className="pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 mb-6">
            <Lock className="h-7 w-7 text-orbit-accent" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Security</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Security is foundational to Orbit. Here is how we protect your
            code and data.
          </p>
        </div>
        <div className="mt-12 space-y-6">
          {[
            {
              title: "Encrypted at Rest & In Transit",
              description:
                "All data is encrypted using AES-256 at rest and TLS 1.3 in transit. API keys are hashed, never stored in plaintext.",
            },
            {
              title: "Ephemeral Execution",
              description:
                "Browser tests run in isolated, ephemeral containers that are destroyed after each run. No persistent access to your environments.",
            },
            {
              title: "Tenant Isolation",
              description:
                "Row-level security ensures workspace data is strictly isolated. No cross-tenant data access is possible.",
            },
            {
              title: "Responsible Disclosure",
              description:
                "Found a vulnerability? Contact us at hello@sunrisesystems.co. We take all reports seriously.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-white/[0.04] bg-card p-6"
            >
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
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
