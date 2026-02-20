import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        agentbase: {
          bg: "#FFFFFF",
          surface: "#FAFAFA",
          border: "#EAEAEA",
          borderStrong: "#D1D1D1",
          text: "#000000",
          muted: "#666666",
          cyan: "#FEC508",
          cyanGlow: "rgba(254, 197, 8, 0.15)",
          yellow: "#FEC508",
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        serif: ["Zarathustra", "serif"],
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, #EAEAEA 1px, transparent 1px), linear-gradient(to bottom, #EAEAEA 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
} satisfies Config;
