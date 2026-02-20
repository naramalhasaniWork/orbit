import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export const metadata = {
  title: "Privacy Policy - Orbit",
  description: "Orbit privacy policy and data handling practices.",
};

export default function PrivacyPage() {
  return (
    <div className="pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 mb-6">
            <Shield className="h-7 w-7 text-orbit-accent" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Your privacy matters to us. A full privacy policy is being prepared
            and will be published here before our public launch.
          </p>
        </div>
        <div className="mt-12 rounded-xl border border-white/[0.04] bg-card p-6 text-sm text-muted-foreground leading-relaxed space-y-4">
          <p>
            Orbit collects only the data necessary to provide our testing
            service. Your source code is processed in ephemeral environments
            and never stored beyond what is required for analysis.
          </p>
          <p>
            We do not sell your data to third parties. All data is encrypted
            in transit and at rest using industry-standard encryption.
          </p>
          <p>
            For questions about our data practices, contact us at{" "}
            <a href="mailto:hello@sunrisesystems.co" className="text-orbit-accent hover:underline">
              hello@sunrisesystems.co
            </a>.
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
