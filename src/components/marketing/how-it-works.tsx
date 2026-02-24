"use client";

import { motion } from "framer-motion";
import { springs } from "@/lib/motion";

const STEPS = [
  {
    number: "01",
    title: "Connect",
    description: "Link your GitHub repo. Orbit clones and analyzes your codebase in seconds.",
  },
  {
    number: "02",
    title: "Understand",
    description: "AI agents map every route, component, API, and data model into a living System Map.",
  },
  {
    number: "03",
    title: "Test",
    description: "Orbit generates test plans, prioritizes by risk, and executes them in real browsers.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-32 lg:py-40 relative">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={springs.smooth}
          className="mb-20"
        >
          <p className="text-[13px] font-medium text-primary tracking-widest uppercase mb-4">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-md">
            Three steps to autonomous testing.
          </h2>
        </motion.div>

        <div className="space-y-16 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-12">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ ...springs.smooth, delay: i * 0.1 }}
            >
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ ...springs.bounce, delay: i * 0.1 + 0.1 }}
                className="text-5xl font-bold text-primary/[0.12] block mb-4 select-none"
              >
                {step.number}
              </motion.span>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
