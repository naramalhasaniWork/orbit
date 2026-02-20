"use client";

import { motion } from "framer-motion";
import {
  Map as MapIcon,
  RefreshCw,
  Code,
  Eye,
  Zap,
  GitPullRequest,
  RotateCw,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Map: MapIcon,
  RefreshCw,
  Code,
  Eye,
  Zap,
  GitPullRequest,
  RotateCw,
  Puzzle,
};

export function FeatureCard({
  feature,
  index,
}: {
  feature: FeatureItem;
  index: number;
}) {
  const Icon = ICON_MAP[feature.icon] ?? Zap;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="group relative rounded-xl border border-white/[0.04] bg-card p-6 hover:border-orbit-accent/20 transition-colors duration-300"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orbit-accent/10 border border-orbit-accent/20 mb-4 group-hover:bg-orbit-accent/20 transition-colors">
        <Icon className="h-5 w-5 text-orbit-accent" />
      </div>
      <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {feature.description}
      </p>
    </motion.div>
  );
}

interface FeaturesContent {
  headline: string;
  subheadline: string;
  items: FeatureItem[];
}

export function FeatureGrid({ content }: { content: FeaturesContent }) {
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {content.headline}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {content.subheadline}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {content.items.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
