declare function gtag(command: string, event: string, params: Record<string, unknown>): void;

import { G } from "./state";

const GA_MEASUREMENT_ID = "G-CT956V6Y2V";
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw6_EH0cRSKYnKVefYMRUnIZSnCm-Xcz8iPlOed-5zou54a_Yf09FJedIYNtY5qZCyX/exec";
export const FEEDBACK_URL = "https://forms.gle/emCFWfyXtkpmL7zL9";

function getAnonId(): string {
  let id = localStorage.getItem("7metch_uid");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("7metch_uid", id);
  }
  return id;
}

function trackGA(event: string, params: Record<string, unknown>): void {
  if (!GA_MEASUREMENT_ID || typeof gtag !== "function") return;
  gtag("event", event, params);
}

function trackGAS(data: Record<string, unknown>): void {
  if (!GAS_ENDPOINT) return;
  data.user_id = getAnonId();
  fetch(GAS_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(data),
  }).catch(() => {});
}

export function track(event: string, params?: Record<string, unknown>): void {
  if (G.debugMode) return;
  trackGA(event, params || {});
  trackGAS({ event, ...params });
}
