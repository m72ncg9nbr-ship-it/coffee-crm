import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const _originalFetch = window.fetch.bind(window);
window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
  return _originalFetch(input, { credentials: "include", ...init });
};

createRoot(document.getElementById("root")!).render(<App />);
