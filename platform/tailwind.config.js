/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design token ufficiali Aethersy (brief §1.2).
        // I valori puntano ai token CSS (src/index.css) come canali RGB, cosi'
        // il tema chiaro/scuro cambia in un solo punto e le opacita' (es.
        // bg-primary/60) continuano a funzionare.
        primary: "rgb(var(--aethersy-primary) / <alpha-value>)",
        secondary: "rgb(var(--aethersy-secondary) / <alpha-value>)",
        tertiary: "rgb(var(--aethersy-tertiary) / <alpha-value>)",
        "bg-dark": "rgb(var(--aethersy-bg-dark) / <alpha-value>)",
        "bg-card": "rgb(var(--aethersy-bg-card) / <alpha-value>)",
        "bg-hover": "rgb(var(--aethersy-bg-hover) / <alpha-value>)",
        "bg-hover-strong": "rgb(var(--aethersy-bg-hover-strong) / <alpha-value>)",
        "text-primary": "rgb(var(--aethersy-text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--aethersy-text-secondary) / <alpha-value>)",
        "text-muted": "rgb(var(--aethersy-text-muted) / <alpha-value>)",
        success: "rgb(var(--aethersy-success) / <alpha-value>)",
        error: "rgb(var(--aethersy-error) / <alpha-value>)",
        warning: "rgb(var(--aethersy-warning) / <alpha-value>)",
        "accent-foreground": "rgb(var(--aethersy-accent-foreground) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "28px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "3xl": ["30px", { lineHeight: "36px" }],
        "4xl": ["36px", { lineHeight: "40px" }],
      },
      animation: {
        "pulse-slow": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-glow": "pulseGlow 1.5s ease-in-out infinite",
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shake: "shake 0.5s ease-in-out infinite",
        orbit: "orbit 12s linear infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.25s ease-out",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(0, 212, 255, 0.5)" },
          "50%": { opacity: "0.75", boxShadow: "0 0 0 6px rgba(0, 212, 255, 0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-2px)" },
          "75%": { transform: "translateX(2px)" },
        },
        orbit: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideInLeft: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      boxShadow: {
        card: "var(--aethersy-shadow-card)",
        glow: "var(--aethersy-shadow-glow)",
        "glow-strong": "var(--aethersy-shadow-glow-strong)",
        fab: "var(--aethersy-shadow-fab)",
      },
      maxWidth: {
        content: "1400px",
      },
    },
  },
  plugins: [],
};
