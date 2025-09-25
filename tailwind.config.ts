import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#f5f3ef",
      },
    },
  },
  plugins: [],
};

export default config;
