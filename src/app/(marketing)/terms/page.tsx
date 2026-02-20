import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export const metadata = {
  title: "Terms of Service - Orbit",
  description: "Orbit terms of service and usage agreement.",
};

export default function TermsPage() {
  return (
    <div className="pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 mb-6">
            <FileText className="h-7 w-7 text-orbit-accent" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Our terms of service are being finalized and will be published
            here before our public launch.
          </p>
        </div>
        <div className="mt-12 rounded-xl border border-white/[0.04] bg-card p-6 text-sm text-muted-foreground leading-relaxed space-y-4">
          <p>
            By using Orbit, you agree to use the platform responsibly and in
            accordance with our acceptable use guidelines. Orbit is designed
            for testing against non-production environments only.
          </p>
          <p>
            Full terms including liability, intellectual property, and
            subscription details will be available prior to public availability.
          </p>
          <p>
            Questions? Reach out at{" "}
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
