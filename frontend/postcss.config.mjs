const config = {
  plugins: [
    "@tailwindcss/postcss",
    // Resolve CSS custom properties to static fallback values for browsers
    // that don't support var() (Opera Mini, older Android WebView, etc.)
    // preserve: true keeps the var() for modern browsers alongside the fallback
    ["postcss-custom-properties", { preserve: true }],
  ],
};

export default config;
