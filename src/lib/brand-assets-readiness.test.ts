import { describe, expect, it } from "vitest";
import {
  computeBrandAssetReadinessFromKeys,
  extractBrandAssetType,
} from "./brand-assets-readiness.js";

describe("brand-assets-readiness", () => {
  it("extracts current and legacy brand asset type prefixes", () => {
    expect(extractBrandAssetType("brand/assets/logo_123_logo.png")).toBe(
      "logo",
    );
    expect(extractBrandAssetType("puki_001/brand/assets/logo_123_logo.png")).toBe(
      "logo",
    );
    expect(extractBrandAssetType("brand/assets/font-file_123_font.woff2")).toBe(
      "font_file",
    );
    expect(
      extractBrandAssetType("brand/sku/brand-assets/palette_123_palette.pdf"),
    ).toBe("palette");
  });

  it("is ready with logo, palette and typography", () => {
    const readiness = computeBrandAssetReadinessFromKeys([
      "brand/assets/logo_123_logo.png",
      "brand/assets/palette_123_palette.pdf",
      "brand/assets/typography_123_type.pdf",
    ]);

    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  it("accepts font files as typography evidence", () => {
    const readiness = computeBrandAssetReadinessFromKeys([
      "brand/assets/logo_123_logo.png",
      "brand/assets/palette_123_palette.pdf",
      "brand/assets/font-file_123_brand.woff2",
    ]);

    expect(readiness.ready).toBe(true);
  });

  it("does not require an identity manual for capture", () => {
    const readiness = computeBrandAssetReadinessFromKeys([
      "brand/assets/logo_123_logo.png",
      "brand/assets/palette_123_palette.pdf",
    ]);

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(["typography"]);
  });
});
