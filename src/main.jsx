import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.jsx";

createRoot(document.getElementById("root")).render(<App />);

// Offline support: network first so a new deploy always wins, cache as fallback.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("sw.js", window.location.href)).catch(() => {});
  });
}
