import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Telemetry native tokens (see globals.css). `live` is the one accent: a browser is running now.
        tm: {
          canvas: "hsl(var(--tm-canvas) / <alpha-value>)",
          surface: "hsl(var(--tm-surface) / <alpha-value>)",
          elevated: "hsl(var(--tm-elevated) / <alpha-value>)",
          sunken: "hsl(var(--tm-sunken) / <alpha-value>)",
          hover: "hsl(var(--tm-hover) / <alpha-value>)",
          line: "hsl(var(--tm-line) / <alpha-value>)",
          "line-strong": "hsl(var(--tm-line-strong) / <alpha-value>)",
          t1: "hsl(var(--tm-t1) / <alpha-value>)",
          t2: "hsl(var(--tm-t2) / <alpha-value>)",
          t3: "hsl(var(--tm-t3) / <alpha-value>)",
          live: "hsl(var(--tm-live) / <alpha-value>)",
          "live-text": "hsl(var(--tm-live-text) / <alpha-value>)",
          pass: "hsl(var(--tm-pass) / <alpha-value>)",
          fail: "hsl(var(--tm-fail) / <alpha-value>)",
          "fail-bg": "hsl(var(--tm-fail-bg) / <alpha-value>)",
          flaky: "hsl(var(--tm-flaky) / <alpha-value>)",
          info: "hsl(var(--tm-info) / <alpha-value>)",
          warn: "hsl(var(--tm-warn) / <alpha-value>)",
        },
        surface: "hsl(var(--tm-surface) / <alpha-value>)",
        // Legacy Orbit names, now aliases of the Telemetry layer.
        orbit: {
          surface: {
            0: "hsl(var(--orbit-surface-0) / <alpha-value>)",
            1: "hsl(var(--orbit-surface-1) / <alpha-value>)",
            2: "hsl(var(--orbit-surface-2) / <alpha-value>)",
            3: "hsl(var(--orbit-surface-3) / <alpha-value>)",
            4: "hsl(var(--orbit-surface-4) / <alpha-value>)",
          },
          glow: "hsl(var(--orbit-glow) / <alpha-value>)",
          success: "hsl(var(--orbit-success) / <alpha-value>)",
          warning: "hsl(var(--orbit-warning) / <alpha-value>)",
          error: "hsl(var(--orbit-error) / <alpha-value>)",
          info: "hsl(var(--orbit-info) / <alpha-value>)",
          pass: "hsl(var(--orbit-pass) / <alpha-value>)",
          fail: "hsl(var(--orbit-fail) / <alpha-value>)",
          flaky: "hsl(var(--orbit-flaky) / <alpha-value>)",
          untested: "hsl(var(--orbit-untested) / <alpha-value>)",
          accent: "hsl(var(--orbit-accent) / <alpha-value>)",
          amber: "hsl(var(--orbit-amber) / <alpha-value>)",
        },
      },
      borderRadius: {
        sm: "var(--tm-radius-control)",
        md: "var(--tm-radius-control)",
        lg: "var(--tm-radius-card)",
        xl: "var(--tm-radius-frame)",
      },
      fontFamily: {
        sans: ["var(--font-instrument-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        label: ["var(--font-martian-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65625rem", { lineHeight: "0.875rem" }],
      },
      letterSpacing: {
        display: "-0.035em",
        label: "0.04em",
      },
      height: {
        row: "var(--tm-row)",
        "row-compact": "var(--tm-row-compact)",
        "row-touch": "var(--tm-row-touch)",
      },
      boxShadow: {
        elevated: "var(--tm-shadow-elevated)",
      },
      // One stacking scale. No arbitrary z-[n]. Dropdowns sit above modals so menus inside dialogs work.
      zIndex: {
        base: "0",
        sticky: "10",
        drawer: "20",
        modal: "30",
        dropdown: "40",
        toast: "50",
        tooltip: "60",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0.7, 0, 1)",
        out: "cubic-bezier(0.2, 0.7, 0, 1)",
        in: "cubic-bezier(0.4, 0, 1, 1)",
        "in-out": "cubic-bezier(0.6, 0, 0.2, 1)",
      },
      transitionDuration: {
        DEFAULT: "120ms",
        feedback: "120ms",
        change: "180ms",
        open: "240ms",
        layout: "280ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { transform: "scale(0.96)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "live-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 180ms cubic-bezier(0.2, 0.7, 0, 1)",
        "accordion-up": "accordion-up 126ms cubic-bezier(0.4, 0, 1, 1)",
        "fade-in": "fade-in 180ms cubic-bezier(0.2, 0.7, 0, 1)",
        "scale-in": "scale-in 180ms cubic-bezier(0.2, 0.7, 0, 1)",
        "slide-up": "slide-up 240ms cubic-bezier(0.2, 0.7, 0, 1)",
        // The only loop. Use <LiveDot>, which also pauses it off-screen.
        "live-pulse": "live-pulse 1.6s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
