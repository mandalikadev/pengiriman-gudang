import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// T109 (DESIGN §11.3): konfirmasi memakai dialog konfirmasi aplikasi, bukan dialog bawaan browser. Satu-satunya
// pengecualian adalah peringatan tinggalkan halaman di perlindungan draft (batas teknis browser).

const AKAR = import.meta.dirname;
const PENGECUALIAN = new Set([path.join("pengiriman-gudang", "[id]", "perlindungan-draft.ts")]);

function berkasKode(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entri) => {
    const lengkap = path.join(folder, entri.name);
    if (entri.isDirectory()) return berkasKode(lengkap);
    return /\.tsx?$/.test(entri.name) && !/\.test\.tsx?$/.test(entri.name) ? [lengkap] : [];
  });
}

describe("tanpa window.confirm di src/app", () => {
  it("hanya perlindungan draft yang memakai dialog bawaan browser", () => {
    const pemakai = berkasKode(AKAR)
      .filter((berkas) => /\bconfirm\s*\(/.test(readFileSync(berkas, "utf8")))
      .map((berkas) => path.relative(AKAR, berkas));
    expect(pemakai.filter((berkas) => !PENGECUALIAN.has(berkas))).toEqual([]);
    // Pengecualian itu tetap ada (tidak diubah tiket ini), jadi pemindaian memang menemukan pemakaian.
    expect(pemakai).toEqual([...PENGECUALIAN]);
  });
});
