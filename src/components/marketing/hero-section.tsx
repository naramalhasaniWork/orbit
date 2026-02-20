"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const ease = [0.21, 0.47, 0.32, 0.98];

function SystemMapMockup() {
  const nodes = [
    { x: 50, y: 30, r: 6, color: "var(--orbit-pass)", label: "/dashboard" },
    { x: 25, y: 55, r: 5, color: "var(--orbit-pass)", label: "/api/auth" },
    { x: 75, y: 55, r: 5, color: "var(--orbit-fail)", label: "/checkout" },
    { x: 15, y: 80, r: 4, color: "var(--orbit-pass)", label: "UserModel" },
    { x: 45, y: 80, r: 4, color: "var(--orbit-flaky)", label: "/settings" },
    { x: 85, y: 80, r: 4, color: "var(--orbit-pass)", label: "PaymentAPI" },
    { x: 60, y: 15, r: 3, color: "var(--orbit-untested)", label: "Navbar" },
    { x: 35, y: 15, r: 3, color: "var(--orbit-pass)", label: "Sidebar" },
  ];

  const edges = [
    [0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [0, 6], [0, 7],
  ];

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl surface-1 border border-white/[0.06] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
        </div>
        <span className="text-[10px] text-muted-foreground ml-2 font-mono">System Map</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[9px] text-muted-foreground/60">12 routes</span>
          <span className="text-[9px] text-muted-foreground/60">8 components</span>
          <span className="text-[9px] text-muted-foreground/60">4 APIs</span>
        </div>
      </div>

      {/* Graph area */}
      <svg viewBox="0 0 100 100" className="w-full h-full p-4" preserveAspectRatio="xMidYMid meet">
        {/* Edges */}
        {edges.map(([from, to], i) => (
          <motion.line
            key={`e-${i}`}
            x1={nodes[from].x} y1={nodes[from].y}
            x2={nodes[to].x} y2={nodes[to].y}
            stroke="hsl(var(--muted-foreground) / 0.15)"
            strokeWidth="0.3"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 + i * 0.08, ease }}
          />
        ))}

        {/* Nodes */}
        {nodes.map((node, i) => (
          <motion.g key={`n-${i}`}>
            <motion.circle
              cx={node.x} cy={node.y} r={node.r}
              fill={`hsl(${node.color})`}
              opacity={0.85}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.85 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.1, ease }}
            />
            <motion.circle
              cx={node.x} cy={node.y} r={node.r + 2}
              fill="none"
              stroke={`hsl(${node.color} / 0.3)`}
              strokeWidth="0.3"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.6 + i * 0.1, ease }}
            />
          </motion.g>
        ))}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-4 flex items-center gap-3">
        {[
          { color: "var(--orbit-pass)", label: "Pass" },
          { color: "var(--orbit-fail)", label: "Fail" },
          { color: "var(--orbit-flaky)", label: "Flaky" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: `hsl(${item.color})` }} />
            <span className="text-[9px] text-muted-foreground/60">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/[0.03] rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-24 lg:py-32 w-full">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          <div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease }}
              className="text-[13px] font-medium text-primary tracking-widest uppercase mb-6"
            >
              AI-Native Testing Platform
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.05, ease }}
              className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.08]"
            >
              Ship faster.
              <br />
              <span className="text-muted-foreground">Break nothing.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.12, ease }}
              className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg"
            >
              Orbit connects to your repo, understands your code, and runs tests
              autonomously. No test scripts. No maintenance. Just coverage.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease }}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <Link
                href="/login"
                className="inline-flex items-center justify-center font-medium bg-primary text-primary-foreground px-7 py-3.5 rounded-full text-[15px] hover:bg-primary/90 transition-all duration-300 hover:shadow-glow"
              >
                Get Started Free
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center justify-center font-medium text-muted-foreground hover:text-foreground px-7 py-3.5 rounded-full text-[15px] border border-white/[0.08] hover:border-white/[0.15] transition-all duration-300"
              >
                See How It Works
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4, ease }}
              className="mt-6 text-xs text-muted-foreground/50"
            >
              Free for up to 100 test runs/month. No credit card required.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3, ease }}
            className="relative hidden lg:block"
          >
            <SystemMapMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
