"use client";

import { motion } from "framer-motion";
import {
  Plug,
  Eye,
  Sliders,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { CtaSection } from "@/components/marketing/cta-section";
import aboutContent from "@/app/(marketing)/content/about.json";


const ICON_MAP: Record<string, LucideIcon> = {
  Plug,
  Eye,
  Sliders,
  DollarSign,
};

export function AboutPageClient() {
  return (
    <div className="pt-24">
      {/* Hero */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl sm:text-5xl font-bold tracking-tight"
          >
            {aboutContent.headline}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto"
          >
            {aboutContent.subheadline}
          </motion.p>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 lg:py-24 bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {aboutContent.story.paragraphs.map((paragraph, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-base text-muted-foreground leading-relaxed mb-6 last:mb-0"
            >
              {paragraph}
            </motion.p>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="py-16 lg:py-24 bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-2xl sm:text-3xl font-bold text-center mb-12"
          >
            Our design principles
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {aboutContent.values.map((value, i) => {
              const Icon = ICON_MAP[value.icon] ?? Eye;
              return (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orbit-accent/10 border border-orbit-accent/20">
                      <Icon className="h-5 w-5 text-orbit-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{value.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {value.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <CtaSection />
    </div>
  );
}
