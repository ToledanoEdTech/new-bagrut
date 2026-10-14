import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
          950: "#042f2e",
        },
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
        accent: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
      },
      fontFamily: {
        sans: ["var(--font-heebo)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
        card: "0 2px 4px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.10)",
        "card-hover":
          "0 4px 8px rgba(15, 23, 42, 0.06), 0 16px 40px -12px rgba(15, 23, 42, 0.18)",
        glow: "0 8px 24px -6px rgba(13, 148, 136, 0.35)",
        "glow-lg": "0 16px 48px -12px rgba(13, 148, 136, 0.45)",
        "inner-top": "inset 0 1px 0 0 rgba(255, 255, 255, 0.10)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #0d9488 0%, #0369a1 50%, #0284c7 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)",
        "mesh-light":
          "radial-gradient(at 0% 0%, rgba(13,148,136,0.08) 0px, transparent 50%), radial-gradient(at 98% 0%, rgba(2,132,199,0.08) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(16,185,129,0.06) 0px, transparent 50%)",
        "mesh-hero":
          "radial-gradient(at 15% 20%, rgba(2,132,199,0.45) 0px, transparent 50%), radial-gradient(at 85% 15%, rgba(13,148,136,0.50) 0px, transparent 50%), radial-gradient(at 70% 85%, rgba(3,105,161,0.40) 0px, transparent 50%), radial-gradient(at 20% 90%, rgba(15,118,110,0.40) 0px, transparent 50%)",
        shimmer:
          "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(-100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-22px) scale(1.05)" },
        },
        aurora: {
          "0%, 100%": { transform: "translate(0, 0) rotate(0deg)" },
          "33%": { transform: "translate(30px, -30px) rotate(4deg)" },
          "66%": { transform: "translate(-20px, 20px) rotate(-4deg)" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "0.7" },
          "70%, 100%": { transform: "scale(1.3)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-in": "fade-in 0.4s ease-out both",
        shimmer: "shimmer 1.6s infinite",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
        aurora: "aurora 18s ease-in-out infinite",
        "gradient-x": "gradient-x 6s ease infinite",
        "pulse-ring": "pulse-ring 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
