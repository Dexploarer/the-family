import type { Repository } from "../storage/repository.js";

export const BRANDING_KEYS = {
  productName: "brand_product_name",
  tagline: "brand_tagline",
  themeColor: "brand_theme_color",
  operatorTitle: "brand_operator_title",
  footerNote: "brand_footer_note",
  accentStart: "brand_accent_start",
  accentEnd: "brand_accent_end"
} as const;

export type BrandingSnapshot = {
  productName: string;
  tagline: string;
  themeColor: string;
  operatorTitle: string;
  footerNote: string;
  accentStart: string;
  accentEnd: string;
};

export type BrandingPatch = Partial<BrandingSnapshot>;

const DEFAULTS: BrandingSnapshot = {
  productName: "BNancy",
  tagline: "the Golden Girl of Binance",
  themeColor: "#f0b90b",
  operatorTitle: "Operator Control",
  footerNote: "Infrastructure only — no profit, token, or execution guarantees.",
  accentStart: "#f8e7ac",
  accentEnd: "#c79a3c"
};

function withFallback(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
}

// Whitelabel strings stored in platform_settings and applied to landing + admin UI.
export class BrandingService {
  constructor(private readonly repository: Repository) {}

  async getSnapshot(): Promise<BrandingSnapshot> {
    const remote = await this.repository.listPlatformSettings();
    return {
      productName: withFallback(remote[BRANDING_KEYS.productName], DEFAULTS.productName),
      tagline: withFallback(remote[BRANDING_KEYS.tagline], DEFAULTS.tagline),
      themeColor: withFallback(remote[BRANDING_KEYS.themeColor], DEFAULTS.themeColor),
      operatorTitle: withFallback(remote[BRANDING_KEYS.operatorTitle], DEFAULTS.operatorTitle),
      footerNote: withFallback(remote[BRANDING_KEYS.footerNote], DEFAULTS.footerNote),
      accentStart: withFallback(remote[BRANDING_KEYS.accentStart], DEFAULTS.accentStart),
      accentEnd: withFallback(remote[BRANDING_KEYS.accentEnd], DEFAULTS.accentEnd)
    };
  }

  async update(patch: BrandingPatch): Promise<BrandingSnapshot> {
    const entries: Array<[string, string | undefined]> = [
      [BRANDING_KEYS.productName, patch.productName],
      [BRANDING_KEYS.tagline, patch.tagline],
      [BRANDING_KEYS.themeColor, patch.themeColor],
      [BRANDING_KEYS.operatorTitle, patch.operatorTitle],
      [BRANDING_KEYS.footerNote, patch.footerNote],
      [BRANDING_KEYS.accentStart, patch.accentStart],
      [BRANDING_KEYS.accentEnd, patch.accentEnd]
    ];
    for (const [key, value] of entries) {
      if (value !== undefined) {
        await this.repository.setPlatformSetting(key, value.trim());
      }
    }
    return this.getSnapshot();
  }
}
