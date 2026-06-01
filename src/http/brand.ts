// Shared <head> branding + social-share (OpenGraph/Twitter) tags. Call
// `${brandHead(branding)}` inside each page's <head>. The absolute og:image URL is filled
// from the base URL set once at startup via setOgBaseUrl(), so a shared BNancy link
// (e.g. the /pool Mini App) shows a title, description, and the BNancy banner.

import type { BrandingSnapshot } from "../services/brandingService.js";

const DEFAULT_BRANDING: BrandingSnapshot = {
  productName: "BNancy",
  tagline: "the Golden Girl of Binance",
  themeColor: "#f0b90b",
  operatorTitle: "Operator Control",
  footerNote: "Infrastructure only — no profit, token, or execution guarantees.",
  accentStart: "#f8e7ac",
  accentEnd: "#c79a3c"
};

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%92%9B%3C/text%3E%3C/svg%3E";

let ogBaseUrl: string | undefined;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function resolveBranding(branding?: BrandingSnapshot): BrandingSnapshot {
  return branding ?? DEFAULT_BRANDING;
}

// Set once at startup so social-share tags can carry an absolute og:image URL.
export function setOgBaseUrl(url: string | undefined): void {
  ogBaseUrl = url === undefined ? undefined : url.replace(/\/$/, "");
}

export function brandHead(branding?: BrandingSnapshot): string {
  const b = resolveBranding(branding);
  const ogTitle = `${b.productName} — ${b.tagline}`;
  const ogDescription =
    "Run a shared BSC Safe trading pool in your Telegram group — pool BNB, trade, and launch tokens. Non-custodial.";
  const imageTags =
    ogBaseUrl === undefined
      ? ""
      : `
  <meta property="og:image" content="${ogBaseUrl}/og-image.png" />
  <meta name="twitter:image" content="${ogBaseUrl}/og-image.png" />`;
  return `<link rel="icon" href="${FAVICON}" />
  <meta name="theme-color" content="${escapeHtml(b.themeColor)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />${imageTags}`;
}

export function brandCssVars(branding?: BrandingSnapshot): string {
  const b = resolveBranding(branding);
  return `:root { --brand-theme: ${b.themeColor}; --brand-accent-start: ${b.accentStart}; --brand-accent-end: ${b.accentEnd}; }`;
}

export { DEFAULT_BRANDING };
