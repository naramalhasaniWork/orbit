"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CtaContent {
  headline: string;
  subheadline: string;
  buttonText: string;
  footnote: string;
}

export function CtaSection({ content }: { content: CtaContent }) {
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl border border-orbit-accent/20 bg-gradient-to-br from-orbit-accent/[0.06] via-card to-card p-12 lg:p-16 text-center overflow-hidden"
        >
          {/* Background glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orbit-accent/10 rounded-full blur-3xl" />

          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {content.headline}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              {content.subheadline}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-orbit-accent hover:bg-orbit-accent/90 text-white h-12 px-10 text-base"
                >
                  {content.buttonText}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground">
                {content.footnote}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
