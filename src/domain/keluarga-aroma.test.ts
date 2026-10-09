import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cocokkanKeluargaAroma, normalisasiAlias } from "./keluarga-aroma";

// ADR-0006, PRD A6 (▶ Keputusan OD-05): baris ranking dicocokkan ke keluarga aroma lewat alias,
// persis setelah normalisasi (huruf besar, spasi dirapikan). Tanpa pencocokan mirip (PRD C3).

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/ranking-september-2026.json"), "utf8"),
) as { baris: { baris: number; variant: string }[] };

const daftarAlias = [
  { alias: "GORGEOUS TUBEROSE", keluarga: { id: 1, nama: "Gorgeous Tuberose" } },
  { alias: "GIFT SET BOX", keluarga: { id: 2, nama: "GIFT SET BOX" } },
];

describe("normalisasiAlias", () => {
  it("huruf besar dan spasi dirapikan", () => {
    expect(normalisasiAlias(" gorgeous  tuberose ")).toBe("GORGEOUS TUBEROSE");
    expect(normalisasiAlias("Gift\tSet   Box")).toBe("GIFT SET BOX");
  });
});

describe("cocokkanKeluargaAroma", () => {
  it('" gorgeous  tuberose " cocok ke alias GORGEOUS TUBEROSE', () => {
    expect(cocokkanKeluargaAroma(" gorgeous  tuberose ", daftarAlias)).toEqual({ id: 1, nama: "Gorgeous Tuberose" });
  });

  it('"GORGEOUS TUBEROS" tidak cocok (tanpa pencocokan mirip)', () => {
    expect(cocokkanKeluargaAroma("GORGEOUS TUBEROS", daftarAlias)).toBeNull();
  });

  it("teks yang lebih panjang atau memuat alias tidak cocok", () => {
    expect(cocokkanKeluargaAroma("GORGEOUS TUBEROSE EDP", daftarAlias)).toBeNull();
    expect(cocokkanKeluargaAroma("GORGEOUSTUBEROSE", daftarAlias)).toBeNull();
  });

  it("setiap VARIANT golden ranking September 2026 cocok ke keluarga yang aliasnya teks itu, termasuk GIFT SET BOX", () => {
    const aliasGolden = golden.baris.map((b) => ({ alias: normalisasiAlias(b.variant), keluarga: b.baris }));
    for (const b of golden.baris) {
      expect(normalisasiAlias(b.variant)).toBe(b.variant);
      expect(cocokkanKeluargaAroma(b.variant, aliasGolden)).toBe(b.baris);
      expect(cocokkanKeluargaAroma(` ${b.variant.toLowerCase()} `, aliasGolden)).toBe(b.baris);
    }
    expect(cocokkanKeluargaAroma("GIFT SET BOX", daftarAlias)).toEqual({ id: 2, nama: "GIFT SET BOX" });
  });
});
