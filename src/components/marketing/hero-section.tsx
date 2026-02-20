"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedSystemMap } from "./animated-system-map";

interface HeroContent {
  headline: string;
  subheadline: string;
  cta: string;
  cta_secondary: string;
  social_proof_bar: {
    text: string;
    stats: Array<{ value: string; label: string }>;
  };
}

export function HeroSection({ content }: { content: HeroContent }) {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden">
      {/* Animated System Map background */}
      <AnimatedSystemMap className="absolute inset-0 opacity-40" />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/40 to-background" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-background/60" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="max-w-3xl">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-orbit-accent/30 bg-orbit-accent/10 px-4 py-1.5 text-xs font-medium text-orbit-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-orbit-accent animate-pulse-glow" />
              AI-Native Testing Platform
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]"
          >
            {content.headline}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl"
          >
            {content.subheadline}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-col sm:flex-row gap-3"
          >
            <Link href="/login">
              <Button
                size="lg"
                className="bg-orbit-accent hover:bg-orbit-accent/90 text-white h-12 px-8 text-base"
              >
                {content.cta}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-8 text-base border-border/60"
            >
              <Play className="mr-2 h-4 w-4" />
              {content.cta_secondary}
            </Button>
          </motion.div>

          {/* Social proof stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-16 flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-10"
          >
            <p className="text-sm text-muted-foreground">
              {content.social_proof_bar.text}
            </p>
            <div className="flex gap-8">
              {content.social_proof_bar.stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-bold text-orbit-accent">
                    {stat.value}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
