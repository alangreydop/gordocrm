import { describe, expect, it } from "vitest";
import {
  buildBrandAssetR2Key,
  buildCanonicalBrandFolder,
  buildJobInputR2Key,
  buildJobOutputPrefix,
  buildTempR2Key,
  classifyClientR2Key,
  resolveClientBrandFolder,
  slugifyStorageSegment,
} from "./client-storage.js";

describe("client-storage", () => {
  it("builds stable canonical client folders with normalized accents and padded numbers", () => {
    expect(slugifyStorageSegment("Puki — Pearls & Toasts S.L.")).toBe(
      "puki-pearls-toasts-s-l",
    );
    expect(buildCanonicalBrandFolder("Puki", 1)).toBe("puki_001");
    expect(buildCanonicalBrandFolder("Quesería Norte", 12)).toBe(
      "queseria-norte_012",
    );
  });

  it("prefers persisted brandFolder and does not use externalClientId unless it is a migration-compatible canonical folder", () => {
    expect(
      resolveClientBrandFolder({
        id: "client_12345678",
        name: "Puki Legal Name",
        company: "Puki S.L.",
        clientNumber: 1,
        brandFolder: "puki_001",
        externalClientId: "lead_abc",
      }),
    ).toBe("puki_001");

    expect(
      resolveClientBrandFolder({
        id: "client_12345678",
        name: "Puki Legal Name",
        company: "Puki S.L.",
        clientNumber: null,
        brandFolder: null,
        externalClientId: "puki_001",
      }),
    ).toBe("puki_001");
  });

  it("builds self-contained R2 keys for brand assets, job inputs, job outputs and temp", () => {
    expect(buildBrandAssetR2Key("puki_001", "font_file", 123, "Puki Font.woff2")).toBe(
      "puki_001/brand/assets/font-file_123_Puki_Font.woff2",
    );
    expect(
      buildJobInputR2Key({
        brandFolder: "puki_001",
        jobId: "job_123",
        filename: "Product shot.png",
        sku: "SKU 1",
        platforms: "AMZ PDP",
        date: new Date("2026-05-01T12:00:00.000Z"),
      }),
    ).toBe("puki_001/jobs/job_123/inputs/puki_job_123_2026-05-01_sku-1_amz-pdp.png");
    expect(buildJobOutputPrefix("puki_001", "job_123")).toBe(
      "puki_001/jobs/job_123/output/",
    );
    expect(buildTempR2Key("puki_001", 123, "brief foto.png")).toBe(
      "puki_001/temp/123_brief_foto.png",
    );
  });

  it("classifies legacy R2 keys without moving existing objects", () => {
    expect(classifyClientR2Key("puki_001/brand/assets/logo_1.png", "puki_001")).toBe(
      "canonical",
    );
    expect(classifyClientR2Key("clients/client_1/jobs/job_1/file.png", "puki_001")).toBe(
      "legacy",
    );
    expect(classifyClientR2Key("puki/SKU/brand-assets/logo_1.png", "puki_001")).toBe(
      "legacy",
    );
    expect(classifyClientR2Key("puki/assets/logo_1.png", "puki_001")).toBe(
      "external",
    );
  });
});
