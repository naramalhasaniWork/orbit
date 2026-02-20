import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

export const metadata = {
  title: "Documentation - Orbit",
  description: "Orbit documentation and guides.",
};

export default function DocsPage() {
  return (
    <div className="pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 mb-6">
          <BookOpen className="h-7 w-7 text-orbit-accent" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Documentation</h1>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
          Comprehensive guides, API references, and tutorials are on the way.
          We are building something great and the docs will be ready soon.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 text-sm text-orbit-accent hover:text-orbit-accent/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
