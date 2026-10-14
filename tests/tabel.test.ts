import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// DESIGN §11.1 (T107). Penjaga sumber:
// - setiap <Table> punya nama untuk pembaca layar: `aria-label` atau <TableCaption> sebagai anak pertamanya;
// - tabel yang bisa melebihi ±15 baris memakai opsi `panjang` (wadah bertinggi terbatas, header menempel).

const akarSrc = join(process.cwd(), "src");

function berkasTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx"))
    .map((e) => join(e.parentPath, e.name));
}

/** Tag pembuka <Table …> beserta potongan sumber sesudahnya, per berkas (relatif terhadap src/). */
function pemakaianTable(): { berkas: string; tag: string; sesudah: string }[] {
  return berkasTsx(akarSrc).flatMap((path) => {
    const sumber = readFileSync(path, "utf8");
    return [...sumber.matchAll(/<Table(?=[\s>])[^>]*>/g)].map((m) => ({
      berkas: relative(akarSrc, path),
      tag: m[0],
      sesudah: sumber.slice(m.index + m[0].length, m.index + m[0].length + 200),
    }));
  });
}

// Tabel yang disebut issue T107 (berkas relatif terhadap src/, aria-label tabelnya).
const tabelPanjang: [string, string][] = [
  [join("app", "pengiriman-gudang", "[id]", "bagian-draft.tsx"), "{`Varian ${toko.nama}`}"],
  [join("app", "admin", "pemetaan-produk", "page.tsx"), '"Daftar produk"'],
  [join("app", "admin", "pemetaan-produk", "daftar-usulan.tsx"), '"Daftar usulan"'],
  [join("app", "riwayat", "rencana-final", "[idRencana]", "page.tsx"), '"Rincian rencana final per produk"'],
  [join("app", "admin", "alias-stok", "daftar-alias.tsx"), '"Daftar alias nama stok"'],
  [join("app", "admin", "alias-stok", "hasil-unggahan.tsx"), '"Hasil per baris"'],
  [join("app", "ringkasan", "page.tsx"), '"Ringkasan per produk dan toko"'],
  [join("app", "riwayat", "tab-rencana-final.tsx"), '"Riwayat rencana final"'],
  [join("app", "admin", "impor", "[id]", "page.tsx"), '"Daftar masalah"'],
  [join("app", "admin", "impor", "[id]", "page.tsx"), '"Data produk berubah"'],
  [join("app", "admin", "impor", "[id]", "page.tsx"), '"Produk baru"'],
];

describe("tabel (DESIGN §11.1)", () => {
  const semua = pemakaianTable();

  it("menemukan pemakaian <Table> di sumber", () => {
    expect(semua.length).toBeGreaterThan(30);
  });

  it("setiap tabel punya nama untuk pembaca layar", () => {
    const tanpaNama = semua.filter((t) => !/\saria-label=/.test(t.tag) && !/^\s*<TableCaption\b/.test(t.sesudah));
    expect(tanpaNama.map((t) => `${t.berkas}: ${t.tag}`)).toEqual([]);
  });

  it.each(tabelPanjang)("%s %s memakai opsi panjang", (berkas, label) => {
    const tabel = semua.filter((t) => t.berkas === berkas && t.tag.includes(`aria-label=${label}`));
    expect(tabel).toHaveLength(1);
    expect(tabel[0].tag).toMatch(/\spanjang[\s>]/);
  });

  it("tabel varian draft: kolom kode dan nama produk menempel", () => {
    const [tabel] = semua.filter((t) => t.tag.includes("aria-label={`Varian ${toko.nama}`}"));
    expect(tabel.tag).toContain("kolomMenempel={2}");
  });

  // DESIGN §3, §6, §11.8 (T122): kolom angka rata kanan lewat prop `angka` (text-right + tabular-nums), bukan kelas manual.
  it("sel dan kepala kolom angka memakai prop angka, bukan text-right manual", () => {
    const manual = berkasTsx(akarSrc).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/<Table(?:Head|Cell)\b[^>]*className="[^"]*\btext-right\b[^>]*>/g)].map(
        (m) => `${relative(akarSrc, path)}: ${m[0]}`,
      ),
    );
    expect(manual).toEqual([]);
  });
});
