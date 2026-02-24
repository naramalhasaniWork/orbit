"use client";

import { motion } from "framer-motion";
import { springs } from "@/lib/motion";

function DashboardMockup() {
  return (
    <div className="rounded-xl surface-1 border border-white/[0.06] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">orbit / acme-app</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--orbit-pass))]" />
          <span className="text-[10px] text-muted-foreground">Last run: 2m ago</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 border-b border-white/[0.06]">
        {[
          { label: "Test Cases", value: "147" },
          { label: "Pass Rate", value: "94.2%" },
          { label: "Coverage", value: "87%" },
          { label: "Avg Duration", value: "1.2s" },
        ].map((stat, i) => (
          <div key={stat.label} className={`px-5 py-4 ${i > 0 ? "border-l border-white/[0.06]" : ""}`}>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{stat.label}</p>
            <p className="text-lg font-semibold mt-0.5 tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Test results */}
      <div className="p-5 space-y-2">
        {[
          { name: "User Authentication Flow", verdict: "pass", duration: "1.8s" },
          { name: "Checkout — Credit Card Payment", verdict: "fail", duration: "3.2s" },
          { name: "Dashboard Data Loading", verdict: "pass", duration: "0.9s" },
          { name: "Settings — Profile Update", verdict: "pass", duration: "1.1s" },
          { name: "Search — Empty Results State", verdict: "flaky", duration: "2.4s" },
          { name: "Navigation — Mobile Menu Toggle", verdict: "pass", duration: "0.6s" },
        ].map((test) => (
          <div key={test.name} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: `hsl(var(--orbit-${test.verdict === "pass" ? "pass" : test.verdict === "fail" ? "fail" : "flaky"}))`,
                }}
              />
              <span className="text-[13px]">{test.name}</span>
            </div>
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">{test.duration}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductShowcase() {
  return (
    <section className="py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={springs.smooth}
          className="text-center mb-16"
        >
          <p className="text-[13px] font-medium text-primary tracking-widest uppercase mb-4">
            Mission Control
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Your testing dashboard.
          </h2>
          <p className="mt-4 text-muted-foreground max-w-md mx-auto">
            Real-time visibility into every test, every run, every failure. Designed for teams that move fast.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={springs.gentle}
        >
          <DashboardMockup />
        </motion.div>
      </div>
    </section>
  );
}
