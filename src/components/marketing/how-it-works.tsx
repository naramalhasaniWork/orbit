"use client";

import { motion } from "framer-motion";

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
          transition={{ duration: 0.5 }}
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
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <span className="text-5xl font-bold text-white/[0.06] block mb-4 select-none">
                {step.number}
              </span>
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
