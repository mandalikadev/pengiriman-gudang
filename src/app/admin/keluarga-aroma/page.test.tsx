import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma, produk, segmenKodeKeluargaAroma } from "@/server/db/schema";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { ubahKeluargaAroma } from "./aksi";
import HalamanKeluargaAroma from "./page";

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async (parameter: Record<string, string> = {}) =>
  renderToStaticMarkup(await HalamanKeluargaAroma({ searchParams: Promise.resolve(parameter) }));

const barisKeluarga = (html: string, id: number) => new RegExp(`<tr[^>]*data-keluarga="${id}".*?</tr>`).exec(html)?.[0] ?? "";
const idDiDaftar = (html: string) => [...html.matchAll(/<tr[^>]*data-keluarga="(\d+)"/g)].map((m) => Number(m[1]));
const panel = (html: string) => /<div[^>]*data-slot="dialog-isi"[^>]*data-bentuk="samping".*$/.exec(html)?.[0] ?? "";

describe("/admin/keluarga-aroma", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(buka()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(buka()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat form tambah keluarga dan daftar ringkas: nama, jumlah alias, segmen kode, jumlah produk terpetakan, status", async () => {
    const kode = randomUUID().slice(0, 8).toUpperCase();
    const [aktif] = await db.insert(keluargaAroma).values({ nama: `GIFT SET BOX ${kode}` }).returning();
    const [nonaktif] = await db.insert(keluargaAroma).values({ nama: `NONAKTIF ${kode}`, aktif: false }).returning();
    await db.insert(aliasKeluargaAroma).values([
      { keluargaId: aktif.id, alias: `GIFT SET BOX ${kode}` },
      { keluargaId: aktif.id, alias: `GSB ${kode}` },
    ]);
    await db.insert(segmenKodeKeluargaAroma).values([
      { keluargaId: aktif.id, segmen: `GSB${kode}` },
      { keluargaId: aktif.id, segmen: `GSX${kode}` },
    ]);
    await db.insert(produk).values(
      [`DW-GSB${kode}`, `DD-GSB${kode}`, `XX-GSB${kode}`].map((k, i) => ({
        kode: k,
        nama: `PRODUK ${k}`,
        ukuran: "100ML",
        kategori: "PARFUM WANITA",
        klasifikasi: "otomatis" as const,
        // Dua terpetakan ke keluarga ini; satu belum dipetakan tidak dihitung.
        ...(i < 2 ? { statusKeluargaAroma: "terpetakan" as const, keluargaAromaId: aktif.id } : {}),
      })),
    );

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await buka({ cari: kode });
    expect(html).toContain("Keluarga aroma");
    expect(html).toContain("Tambah keluarga aroma");
    expect(idDiDaftar(html)).toEqual([aktif.id, nonaktif.id]);
    const baris = barisKeluarga(html, aktif.id);
    expect(baris).toContain(`>GIFT SET BOX ${kode}<`);
    expect(baris).toContain('data-jumlah-alias="2"');
    expect(baris).toContain(`GSB${kode}, GSX${kode}`);
    expect(baris).toContain('data-jumlah-produk="2"');
    // DESIGN §7: status ikon + teks lewat komponen T07.
    expect(baris).toContain('data-status="aktif"');
    expect(barisKeluarga(html, nonaktif.id)).toContain('data-status="nonaktif"');
    expect(barisKeluarga(html, nonaktif.id)).toContain('data-jumlah-produk="0"');
    // Daftar ringkas: tanpa form yang selalu terbuka; "Ubah" menautkan panel keluarga itu dengan pencarian tetap.
    expect(html).not.toContain("Simpan keluarga");
    expect(html).not.toContain("Tambah alias");
    expect(baris).toContain(`href="/admin/keluarga-aroma?cari=${kode}&amp;ubah=${aktif.id}"`);
    expect(baris).toMatch(/>Ubah<span class="sr-only"> keluarga GIFT SET BOX/);
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("cari nama, alias, atau segmen kode menyaring daftar", async () => {
    const kode = randomUUID().slice(0, 8).toUpperCase();
    const [a] = await db.insert(keluargaAroma).values({ nama: `MAWAR ${kode}` }).returning();
    const [b] = await db.insert(keluargaAroma).values({ nama: `MELATI ${kode}` }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: b.id, alias: `JASMINE ${kode}` });
    await db.insert(segmenKodeKeluargaAroma).values({ keluargaId: a.id, segmen: `MWR${kode}` });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    expect(idDiDaftar(await buka({ cari: kode }))).toEqual([a.id, b.id]);
    expect(idDiDaftar(await buka({ cari: `melati ${kode}` }))).toEqual([b.id]);
    expect(idDiDaftar(await buka({ cari: `jasmine ${kode}` }))).toEqual([b.id]);
    expect(idDiDaftar(await buka({ cari: `mwr${kode}` }))).toEqual([a.id]);
    expect(await buka({ cari: `TIDAK ADA ${kode}` })).toContain("Tidak ada keluarga aroma yang cocok dengan pencarian ini.");
  });

  it("halaman 50 baris", async () => {
    const kode = randomUUID().slice(0, 8).toUpperCase();
    const dibuat = await db
      .insert(keluargaAroma)
      .values(Array.from({ length: 55 }, (_, i) => ({ nama: `HLM ${kode} ${String(i + 1).padStart(2, "0")}` })))
      .returning({ id: keluargaAroma.id });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const halaman1 = await buka({ cari: `HLM ${kode}` });
    expect(idDiDaftar(halaman1)).toEqual(dibuat.slice(0, 50).map((d) => d.id));
    expect(halaman1).toContain("Baris 1–50 dari 55 · Halaman 1 dari 2");
    expect(idDiDaftar(await buka({ cari: `HLM ${kode}`, halaman: "2" }))).toEqual(dibuat.slice(50).map((d) => d.id));
  });

  it('"Ubah" membuka panel samping berisi form keluarga itu; simpan memperbarui daftar', async () => {
    const kode = randomUUID().slice(0, 8).toUpperCase();
    const [keluarga] = await db.insert(keluargaAroma).values({ nama: `GORGEOUS ${kode}` }).returning();
    const [lain] = await db.insert(keluargaAroma).values({ nama: `LAIN ${kode}` }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: keluarga.id, alias: `GORGEOUS ${kode}` });
    await db.insert(segmenKodeKeluargaAroma).values({ keluargaId: keluarga.id, segmen: `GOR${kode}` });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    expect(panel(await buka({ cari: kode }))).toBe("");
    const html = await buka({ cari: kode, ubah: String(keluarga.id) });
    const isi = panel(html);
    // Panel samping dengan judul dan tombol Tutup (DESIGN §11.2); baris yang dibuka ditandai terpilih.
    expect(isi).toMatch(new RegExp(`<h2[^>]*>Ubah keluarga GORGEOUS ${kode}</h2>`));
    expect(isi).toContain("Tutup");
    expect(isi).toContain(`data-ubah-keluarga="${keluarga.id}"`);
    // Form yang sama dengan kartu sebelumnya: nama + status, alias, segmen kode (hapus lewat konfirmasi T109).
    expect(isi).toContain(`value="GORGEOUS ${kode}"`);
    expect(isi).toContain("Simpan keluarga");
    expect(isi).toContain(`aria-label="Hapus alias GORGEOUS ${kode}"`);
    expect(isi).toContain("Tambah alias");
    expect(isi).toContain(`aria-label="Hapus segmen kode GOR${kode}"`);
    expect(isi).toContain("Tambah segmen kode");
    expect(isi).not.toContain(`LAIN ${kode}`);
    expect(barisKeluarga(html, keluarga.id)).toContain('data-state="selected"');
    expect(barisKeluarga(html, lain.id)).not.toContain('data-state="selected"');

    // Simpan dari panel (aksi yang sama dengan form) → daftar memuat nama dan status baru.
    expect(await ubahKeluargaAroma({ idKeluarga: keluarga.id, nama: `GORGEOUS BARU ${kode}`, aktif: false })).toEqual({
      keadaan: "berhasil",
    });
    const sesudah = await buka({ cari: kode, ubah: String(keluarga.id) });
    expect(barisKeluarga(sesudah, keluarga.id)).toContain(`>GORGEOUS BARU ${kode}<`);
    expect(barisKeluarga(sesudah, keluarga.id)).toContain('data-status="nonaktif"');
    expect(panel(sesudah)).toMatch(new RegExp(`<h2[^>]*>Ubah keluarga GORGEOUS BARU ${kode}</h2>`));
  });

  it("id panel tidak dikenal atau tidak valid → panel tidak dibuka", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    expect(panel(await buka({ ubah: "999999999" }))).toBe("");
    expect(panel(await buka({ ubah: "bukan-angka" }))).toBe("");
  });
});
