import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { paper: "#F5F7F6", ink: "#14201C", teal: { DEFAULT: "#0F766E" }, amber: { DEFAULT: "#B45309" } } } },
} satisfies Config;
