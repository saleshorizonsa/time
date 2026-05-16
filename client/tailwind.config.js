export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        line: "#d8dee8",
        surface: "#f7f9fc",
        brand: "#1f6feb",
        good: "#16794c",
        warn: "#b45309",
        bad: "#b42318"
      },
      boxShadow: {
        panel: "0 12px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
