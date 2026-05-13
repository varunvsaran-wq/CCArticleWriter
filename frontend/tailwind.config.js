/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
            a: { color: "#4f46e5", textDecoration: "underline" },
            "sup a": { textDecoration: "none" },
          },
        },
      },
    },
  },
  plugins: [],
};
