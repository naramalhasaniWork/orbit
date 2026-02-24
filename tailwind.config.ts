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
        surface: "hsl(var(--surface, var(--card)))",
        // Orbit design system colors
        orbit: {
          surface: {
            0: "hsl(var(--orbit-surface-0))",
            1: "hsl(var(--orbit-surface-1))",
            2: "hsl(var(--orbit-surface-2))",
            3: "hsl(var(--orbit-surface-3))",
            4: "hsl(var(--orbit-surface-4))",
          },
          glow: "hsl(var(--orbit-glow))",
          success: "hsl(var(--orbit-success))",
          warning: "hsl(var(--orbit-warning))",
          error: "hsl(var(--orbit-error))",
          info: "hsl(var(--orbit-info))",
          pass: "hsl(var(--orbit-pass))",
          fail: "hsl(var(--orbit-fail))",
          flaky: "hsl(var(--orbit-flaky))",
          untested: "hsl(var(--orbit-untested))",
          accent: "hsl(var(--orbit-accent))",
          amber: "hsl(var(--orbit-amber))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      letterSpacing: {
        display: "-0.025em",
      },
      boxShadow: {
        glow: "0 0 16px hsl(var(--primary) / 0.25), 0 0 4px hsl(var(--primary) / 0.15)",
        "glow-sm": "0 0 8px hsl(var(--primary) / 0.2)",
        "glow-lg": "0 0 24px hsl(var(--primary) / 0.3), 0 0 8px hsl(var(--primary) / 0.2)",
        "glow-accent": "0 0 16px hsl(var(--orbit-accent) / 0.3), 0 0 4px hsl(var(--orbit-accent) / 0.2)",
        "inner-glow": "inset 0 1px 0 hsl(var(--primary) / 0.1)",
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
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "node-appear": {
          from: { transform: "scale(0)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 4px currentColor" },
          "50%": { boxShadow: "0 0 12px currentColor, 0 0 4px currentColor" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "orbit-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "border-glow": {
          "0%, 100%": { borderColor: "hsl(var(--primary) / 0.2)" },
          "50%": { borderColor: "hsl(var(--primary) / 0.5)" },
        },
        "dot-pulse": {
          "0%, 100%": { opacity: "0.3", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
        "progress-glow": {
          "0%, 100%": { boxShadow: "2px 0 4px currentColor" },
          "50%": { boxShadow: "2px 0 12px currentColor" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "node-appear": "node-appear 0.3s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
        "orbit-spin": "orbit-spin 3s linear infinite",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "border-glow": "border-glow 3s ease-in-out infinite",
        "dot-pulse": "dot-pulse 1s ease-in-out infinite",
        "progress-glow": "progress-glow 2s ease-in-out infinite",
      },
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
        "300": "300ms",
        "500": "500ms",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
