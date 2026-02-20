"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function CtaSection() {
  return (
    <section className="py-32 lg:py-40 border-t border-white/[0.04] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-primary/[0.04] rounded-full blur-[100px]" />
      </div>
      <div className="relative mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Ready to ship with confidence?
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-md mx-auto">
            Get started in under 2 minutes. Connect your repo and let Orbit handle the rest.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center font-medium bg-primary text-primary-foreground px-8 py-4 rounded-full text-base hover:bg-primary/90 transition-all duration-300 hover:shadow-glow"
            >
              Start Testing Free
            </Link>
            <p className="text-xs text-muted-foreground/50">
              No credit card required. 100 free test runs/month.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
