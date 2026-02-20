"use client";

import { motion } from "framer-motion";
import { Check, X, Minus } from "lucide-react";

interface ComparisonContent {
  headline: string;
  subheadline: string;
  features: string[];
  competitors: Array<{
    name: string;
    highlight: boolean;
    scores: boolean[];
  }>;
}

function ScoreCell({ value, highlight }: { value: boolean; highlight: boolean }) {
  if (value) {
    return (
      <div className={`flex items-center justify-center ${highlight ? "text-orbit-pass" : "text-orbit-pass/60"}`}>
        <Check className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center text-muted-foreground/40">
      <Minus className="h-4 w-4" />
    </div>
  );
}

export function ComparisonTable({ content }: { content: ComparisonContent }) {
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
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            {content.subheadline}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="overflow-x-auto"
        >
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground w-52" />
                {content.competitors.map((comp) => (
                  <th
                    key={comp.name}
                    className={`py-3 px-4 text-center text-sm font-semibold ${
                      comp.highlight
                        ? "text-orbit-accent"
                        : "text-muted-foreground"
                    }`}
                  >
                    {comp.name}
                    {comp.highlight && (
                      <div className="h-0.5 mt-1 bg-orbit-accent/40 rounded-full" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.features.map((feature, fi) => (
                <tr
                  key={feature}
                  className="border-t border-border/30 hover:bg-secondary/30 transition-colors"
                >
                  <td className="py-3 px-4 text-sm">{feature}</td>
                  {content.competitors.map((comp) => (
                    <td key={comp.name} className="py-3 px-4">
                      <ScoreCell
                        value={comp.scores[fi]}
                        highlight={comp.highlight}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
