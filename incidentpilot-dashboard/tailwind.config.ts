import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0A0E13",
        panel: "#10161D",
        raised: "#151D26",
        line: "#202B37",
        ink: "#E4EAF0",
        muted: "#7C8A99",
        good: "#3FB27F",
        bad: "#F0644F",
        warn: "#E3A33B",
        info: "#5B9BF0",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
