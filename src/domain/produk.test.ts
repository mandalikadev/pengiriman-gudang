import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { klasifikasiProduk } from "./produk";

type KasusKlasifikasi = {
  kode: string;
  kategori: string;
  klasifikasi: string;
  alasan?: string;
};

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/klasifikasi-produk.json"), "utf8"),
) as { kasus: KasusKlasifikasi[] };

describe("klasifikasiProduk (golden klasifikasi-produk)", () => {
  it.each(fixture.kasus)("$kode ($kategori) → $klasifikasi", (kasus) => {
    const harapan =
      kasus.alasan === undefined
        ? { klasifikasi: kasus.klasifikasi }
        : { klasifikasi: kasus.klasifikasi, alasan: kasus.alasan };

    expect(klasifikasiProduk(kasus.kode, kasus.kategori)).toStrictEqual(harapan);
  });
});
