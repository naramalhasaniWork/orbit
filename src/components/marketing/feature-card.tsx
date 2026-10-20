"use client";

import { motion } from "framer-motion";
import { tween } from "@/lib/motion";

const FEATURES = [
  {
    title: "Code-Aware Testing",
    description: "Understands your routes, components, APIs, and data models. Tests are generated from your actual codebase, not guesses.",
  },
  {
    title: "Self-Healing Selectors",
    description: "When your UI changes, tests adapt automatically. No more broken selectors after every deploy.",
  },
  {
    title: "Continuous Coverage",
    description: "Runs on every push, PR, and deploy. Coverage grows automatically as your codebase evolves.",
  },
  {
    title: "AI Failure Analysis",
    description: "When tests fail, AI explains what broke, why, and suggests the fix. Create Linear issues in one click.",
  },
];

export function FeatureGrid() {
  return (
    <section className="py-32 lg:py-40 border-t border-white/[0.04]">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={tween.open}
          className="mb-20"
        >
          <p className="text-[13px] font-medium text-primary tracking-widest uppercase mb-4">
            Capabilities
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-lg">
            Everything you need. Nothing you don&apos;t.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/[0.04] rounded-xl overflow-hidden">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ ...tween.open, delay: i * 0.06 }}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
              className="bg-background p-8 lg:p-10 transition-shadow hover:shadow-[0_0_24px_rgba(255,255,255,0.02)]"
            >
              <h3 className="text-base font-semibold mb-3">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
