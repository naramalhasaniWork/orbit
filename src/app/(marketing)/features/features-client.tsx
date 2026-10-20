"use client";

import { motion } from "framer-motion";
import {
  Code,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Route,
  BarChart3,
  Shield,
  UserCheck,
  Monitor,
  Wrench,
  Eye,
  Camera,
  Zap,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
  Network,
  Brain,
  Search,
  Plug,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { CtaSection } from "@/components/marketing/cta-section";
import featuresContent from "@/app/(marketing)/content/features.json";

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
}

interface CategoryGroup {
  title: string;
  features: Feature[];
}

function groupByCategory(features: Feature[]): CategoryGroup[] {
  const map = new Map<string, Feature[]>();
  for (const f of features) {
    const existing = map.get(f.category) ?? [];
    existing.push(f);
    map.set(f.category, existing);
  }
  return Array.from(map.entries()).map(([title, items]) => ({
    title,
    features: items,
  }));
}

const ICON_MAP: Record<string, LucideIcon> = {
  Code,
  Layers,
  Map: MapIcon,
  RefreshCw,
  Route,
  BarChart3,
  Shield,
  UserCheck,
  Monitor,
  Wrench,
  Eye,
  Camera,
  Zap,
  AlertCircle,
  AlertTriangle,
  MessageSquare,
  Network,
  Brain,
  Search,
  Plug,
  Repeat,
  // Lowercase aliases matching JSON icon values
  network: Network,
  brain: Brain,
  monitor: Monitor,
  refresh: RefreshCw,
  repeat: Repeat,
  search: Search,
  plug: Plug,
  shield: Shield,
};

export function FeaturesPageClient() {
  const categories = groupByCategory(featuresContent.features);

  return (
    <div className="pt-24">
      {/* Header */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl sm:text-5xl font-bold tracking-tight"
          >
            {featuresContent.section_title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            {featuresContent.section_subtitle}
          </motion.p>
        </div>
      </section>

      {/* Feature categories */}
      {categories.map((category, ci) => (
        <section
          key={category.title}
          className={`py-16 lg:py-24 ${ci % 2 === 1 ? "bg-card/50" : ""}`}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5 }}
              className="mb-12"
            >
              <h2 className="text-2xl sm:text-3xl font-bold capitalize">
                {category.title}
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {category.features.map((feature, fi) => {
                const Icon = ICON_MAP[feature.icon] ?? Zap;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.4, delay: fi * 0.08 }}
                    className="group rounded-xl border border-border bg-card p-6 hover:border-orbit-accent/20 transition-colors"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orbit-accent/10 border border-orbit-accent/20">
                        <Icon className="h-5 w-5 text-orbit-accent" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <CtaSection />
    </div>
  );
}
