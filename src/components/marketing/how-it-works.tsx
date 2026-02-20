"use client";

import { motion } from "framer-motion";
import {
  GitBranch,
  Scan,
  FileCheck,
  Play,
  type LucideIcon,
} from "lucide-react";

interface Step {
  number: number;
  title: string;
  description: string;
  icon: string;
}

interface HowItWorksContent {
  headline: string;
  subheadline: string;
  steps: Step[];
}

const ICON_MAP: Record<string, LucideIcon> = {
  GitBranch,
  Scan,
  FileCheck,
  Play,
};

export function HowItWorks({ content }: { content: HowItWorksContent }) {
  return (
    <section className="py-24 lg:py-32 relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
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

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
          {content.steps.map((step, i) => {
            const Icon = ICON_MAP[step.icon] ?? GitBranch;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative"
              >
                {/* Connector line (desktop only) */}
                {i < content.steps.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-[calc(50%+2rem)] right-0 h-px bg-gradient-to-r from-orbit-accent/30 to-transparent" />
                )}

                <div className="flex flex-col items-center text-center">
                  {/* Icon */}
                  <div className="relative mb-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orbit-accent/10 border border-orbit-accent/20">
                      <Icon className="h-8 w-8 text-orbit-accent" />
                    </div>
                    <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-orbit-accent text-xs font-bold text-white">
                      {step.number}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
