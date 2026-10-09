import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  cocokkanKeluargaAroma,
  normalisasiAlias,
  normalisasiSegmenKode,
  segmenKodeProduk,
  usulkanKeluargaAroma,
} from "./keluarga-aroma";

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

// Issue T45, ADR-0006: usulan keluarga dari segmen kode yang dicatat admin, cocok persis; akhiran rework `-R` dan
// tester `-T` diabaikan. Contoh literal dari issue.
describe("normalisasiSegmenKode", () => {
  it("spasi di tepi dibuang dan huruf besar", () => {
    expect(normalisasiSegmenKode(" gor ")).toBe("GOR");
  });
});

describe("segmenKodeProduk", () => {
  it("memecah kode pada tanda hubung", () => {
    expect(segmenKodeProduk("DD-HAM120-MRF")).toEqual(["DD", "HAM120", "MRF"]);
  });

  it("akhiran rework -R dan tester -T diabaikan", () => {
    expect(segmenKodeProduk("DW110E-GOR-R")).toEqual(["DW110E", "GOR"]);
    expect(segmenKodeProduk("DW110E-GOR-T")).toEqual(["DW110E", "GOR"]);
  });
});

describe("usulkanKeluargaAroma", () => {
  const segmen = [
    { segmen: "GOR", keluarga: 1 },
    { segmen: "MRF", keluarga: 2 },
  ];

  it("DD-HAM120-MRF dan DW110E-GOR-R mendapat usulan dari segmen yang dicatat, bukan dari posisi tetap", () => {
    expect(usulkanKeluargaAroma("DD-HAM120-MRF", segmen)).toBe(2);
    expect(usulkanKeluargaAroma("DW110E-GOR-R", segmen)).toBe(1);
  });

  it("rework dan tester mengikuti keluarga varian non-rework-nya", () => {
    expect(usulkanKeluargaAroma("DW110E-GOR", segmen)).toBe(1);
    expect(usulkanKeluargaAroma("DW110E-GOR-T", segmen)).toBe(1);
  });

  it("akhiran -R/-T tidak bisa menjadi sumber usulan walaupun dicatat sebagai segmen", () => {
    expect(usulkanKeluargaAroma("DW110E-ABC-R", [{ segmen: "R", keluarga: 3 }])).toBeNull();
    expect(usulkanKeluargaAroma("DW110E-ABC-T", [{ segmen: "T", keluarga: 3 }])).toBeNull();
  });

  it("kode tanpa segmen yang cocok persis tidak diberi usulan", () => {
    expect(usulkanKeluargaAroma("DP120E-24H", segmen)).toBeNull();
    expect(usulkanKeluargaAroma("DW110E-GORX", segmen)).toBeNull();
    expect(usulkanKeluargaAroma("DW110EGOR", segmen)).toBeNull();
    expect(usulkanKeluargaAroma("DW110E-GOR", [])).toBeNull();
  });

  it("segmen yang menunjuk lebih dari satu keluarga tidak diberi usulan", () => {
    expect(usulkanKeluargaAroma("DD-GOR-MRF", segmen)).toBeNull();
  });

  it("dua segmen yang menunjuk keluarga yang sama tetap diusulkan", () => {
    expect(usulkanKeluargaAroma("DD-GOR-GOR2", [...segmen, { segmen: "GOR2", keluarga: 1 }])).toBe(1);
  });
});
