module.exports = {
  content: ["./www/index.html", "./www/app.js"],
  theme: {
    extend: {
      colors: {
        canvas: "#0B1120",
        surface: "#141C2B",
        elevated: "#1D2739",
        line: "#2A3547",
        snow: "#F8FAFC",
        silver: "#94A3B8",
        muted: "#64748B",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        "accent-deep": "rgb(var(--accent-deep) / <alpha-value>)",
        danger: "#EF4444",
        warn: "#F59E0B"
      },
      fontFamily: {
        display: ["system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
        body: ["system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"]
      }
    }
  },
  plugins: []
};
