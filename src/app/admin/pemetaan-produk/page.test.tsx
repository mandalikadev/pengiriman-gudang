import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { keluargaAroma, produk, segmenKodeKeluargaAroma } from "@/server/db/schema";
import { terapkanPemetaan } from "@/server/keluarga-aroma/pemetaan";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { konfirmasiPemetaan } from "./aksi";
import HalamanPemetaanProduk from "./page";

function acak() {
  return randomUUID().slice(0, 8).toUpperCase();
}

/**
 * Database test dipakai bersama berkas lain, jadi daftar produk bisa lebih dari satu halaman (T119). Nama produk uji
 * memuat `TAG` agar test bisa mencarinya.
 */
const TAG = `UJIPMT${acak()}`;

async function buatProduk(kode: string, nama = `PRODUK ${TAG} ${kode}`) {
  await db.insert(produk).values({ kode, nama, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" });
  return kode;
}

async function buatKeluargaDenganSegmen(segmen: string) {
  const [keluarga] = await db.insert(keluargaAroma).values({ nama: `KELUARGA ${acak()}` }).returning();
  await db.insert(segmenKodeKeluargaAroma).values({ keluargaId: keluarga.id, segmen });
  return keluarga;
}

async function render(parameter: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await HalamanPemetaanProduk({ searchParams: Promise.resolve({ cari: TAG, cariUsulan: TAG, ...parameter }) }),
  );
}

/** Kode produk di baris daftar produk, urut tampil. */
function kodeDiDaftarProduk(html: string) {
  return [...html.matchAll(/<tr[^>]*data-produk="([^"]+)"/g)].map((m) => m[1]);
}

/** Teks "Baris a–b dari n · Halaman h dari m" pada navigasi `label`. */
function navigasi(html: string, label: string) {
  return new RegExp(`<nav aria-label="${label}".*?</nav>`).exec(html)?.[0] ?? "";
}

/** Baris tabel yang memuat `kode` (untuk memeriksa isi satu baris). */
function barisDengan(html: string, kode: string) {
  return html.match(new RegExp(`<tr[^>]*>(?:(?!</tr>).)*${kode}(?:(?!</tr>).)*</tr>`, "g")) ?? [];
}

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/pemetaan-produk", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(render()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404 (non-admin ditolak di server)", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(render()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("usulan dari segmen yang dicatat tampil, tetapi status produk tetap belum dipetakan sebelum dikonfirmasi", async () => {
    const segmenMrf = `MRF${acak()}`;
    const segmenGor = `GOR${acak()}`;
    const keluargaMrf = await buatKeluargaDenganSegmen(segmenMrf);
    const keluargaGor = await buatKeluargaDenganSegmen(segmenGor);
    const ham = await buatProduk(`DD-HAM120-${segmenMrf}`);
    const rework = await buatProduk(`DW110E-${segmenGor}-R`);
    const tanpaCocok = await buatProduk(`DW110E-${segmenGor}X`);

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await render();

    expect(html).toContain("Pemetaan produk");
    expect(html).toContain("Daftar usulan");
    expect(html).toContain("Konfirmasi usulan terpilih");
    // Daftar usulan dan kolom keluarga: usulan dari segmen yang dicatat.
    expect(barisDengan(html, ham).some((b) => b.includes(`Usulan: ${keluargaMrf.nama}`))).toBe(true);
    expect(barisDengan(html, rework).some((b) => b.includes(`Usulan: ${keluargaGor.nama}`))).toBe(true);
    // Segmen yang tidak cocok persis tidak menghasilkan usulan.
    expect(barisDengan(html, tanpaCocok).some((b) => b.includes("Usulan:"))).toBe(false);

    const status = await db
      .select({ kode: produk.kode, status: produk.statusKeluargaAroma, idKeluarga: produk.keluargaAromaId })
      .from(produk)
      .where(inArray(produk.kode, [ham, rework]));
    expect(status).toEqual(
      expect.arrayContaining([
        { kode: ham, status: "belum-dipetakan", idKeluarga: null },
        { kode: rework, status: "belum-dipetakan", idKeluarga: null },
      ]),
    );
    // DESIGN §7: status ikon + teks.
    expect(barisDengan(html, ham).some((b) => b.includes('data-status-pemetaan="belum-dipetakan"'))).toBe(true);
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("filter status menampilkan produk berstatus itu saja; riwayat menampilkan siapa, dari → ke", async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    const segmen = `TER${acak()}`;
    const keluarga = await buatKeluargaDenganSegmen(segmen);
    const terpetakan = await buatProduk(`DW110E-${segmen}`);
    const belum = await buatProduk(`DW110E-BLM${acak()}`);
    await terapkanPemetaan(admin.id, [{ kodeProduk: terpetakan, tujuan: { status: "terpetakan", idKeluarga: keluarga.id } }]);

    const htmlTerpetakan = await render({ status: "terpetakan" });
    expect(htmlTerpetakan).toContain('aria-current="page"');
    expect(barisDengan(htmlTerpetakan, terpetakan).some((b) => b.includes('data-status-pemetaan="terpetakan"'))).toBe(true);
    expect(barisDengan(htmlTerpetakan, belum)).toEqual([]);

    const htmlBelum = await render({ status: "belum-dipetakan" });
    expect(barisDengan(htmlBelum, belum).length).toBeGreaterThan(0);
    // Produk terpetakan hanya muncul di riwayat, bukan di daftar produk berfilter belum dipetakan.
    expect(barisDengan(htmlBelum, terpetakan).every((b) => b.includes("Belum dipetakan") && b.includes("Uji admin"))).toBe(
      true,
    );

    const riwayat = barisDengan(htmlTerpetakan, terpetakan).find((b) => b.includes("Uji admin"));
    expect(riwayat).toContain("Belum dipetakan");
    expect(riwayat).toContain(`Terpetakan: ${keluarga.nama}`);
  });

  it("keluarga nonaktif tidak diusulkan; produk terpetakan ke keluarga yang kemudian dinonaktifkan tetap tampil", async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    const segmen = `NON${acak()}`;
    const keluarga = await buatKeluargaDenganSegmen(segmen);
    const lama = await buatProduk(`DW110E-${segmen}`);
    const baru = await buatProduk(`DD-HAM120-${segmen}`);
    await terapkanPemetaan(admin.id, [{ kodeProduk: lama, tujuan: { status: "terpetakan", idKeluarga: keluarga.id } }]);
    await db.update(keluargaAroma).set({ aktif: false }).where(eq(keluargaAroma.id, keluarga.id));

    const html = await render();
    // Segmen milik keluarga nonaktif tidak menghasilkan usulan, di daftar usulan maupun kolom keluarga.
    expect(barisDengan(html, baru).length).toBeGreaterThan(0);
    expect(barisDengan(html, baru).some((b) => b.includes("Usulan:") || b.includes(keluarga.nama))).toBe(false);
    // Pemetaan lama tetap: status terpetakan (DESIGN §7), nama keluarga, dan nilai terpilih di form.
    const barisLama = barisDengan(html, lama).find((b) => b.includes('data-status-pemetaan="terpetakan"'));
    expect(barisLama).toContain(`${keluarga.nama}</td>`);
    expect(barisLama).toContain(`${keluarga.nama} (nonaktif)`);
  });

  describe("T119: cari dan halaman 50 baris", () => {
    /** 60 produk dengan awalan sama, urut kode: 01..60. */
    async function buatEnamPuluhProduk(awalan: string) {
      const kode = Array.from({ length: 60 }, (_, i) => `${awalan}-${String(i + 1).padStart(2, "0")}`);
      await db.insert(produk).values(
        kode.map((k) => ({ kode: k, nama: `PRODUK ${k}`, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" as const })),
      );
      return kode;
    }

    it("menampilkan 50 baris per halaman; halaman 2 berisi sisanya; keadaan halaman dan cari di URL", async () => {
      kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
      const awalan = `HLM${acak()}`;
      const kode = await buatEnamPuluhProduk(awalan);

      const halaman1 = await render({ cari: awalan });
      expect(kodeDiDaftarProduk(halaman1)).toEqual(kode.slice(0, 50));
      const nav1 = navigasi(halaman1, "Halaman daftar produk");
      expect(nav1).toContain("Baris 1–50 dari 60 · Halaman 1 dari 2");
      expect(nav1).toContain(`href="/admin/pemetaan-produk?cari=${awalan}&amp;halaman=2&amp;cariUsulan=${TAG}"`);
      expect(nav1).not.toContain("Sebelumnya");

      const halaman2 = await render({ cari: awalan, halaman: "2" });
      expect(kodeDiDaftarProduk(halaman2)).toEqual(kode.slice(50));
      expect(navigasi(halaman2, "Halaman daftar produk")).toContain("Baris 51–60 dari 60 · Halaman 2 dari 2");
      // Kotak cari: form GET dengan nilai pencarian saat ini.
      expect(halaman2).toMatch(new RegExp(`<form[^>]*data-kotak-cari="cari"[^>]*>.*?name="cari"[^>]*value="${awalan}"`));
    });

    it('cari "GOR" menyaring daftar produk ke kode atau nama yang memuat GOR', async () => {
      kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
      const gor = await buatProduk(`DW110E-GOR-${acak()}`);
      const lain = await buatProduk(`DW110E-MRF-${acak()}`, `PRODUK ${acak()}`);
      const html = await render({ cari: "gor" });
      const tampil = kodeDiDaftarProduk(html);
      expect(tampil.length).toBeGreaterThan(0);
      expect(tampil.length).toBeLessThanOrEqual(50);
      for (const k of tampil) {
        const baris = barisDengan(html, k).find((b) => b.includes(`data-produk="${k}"`)) ?? "";
        expect(baris.toUpperCase()).toContain("GOR");
      }
      expect(tampil).not.toContain(lain);
      // Produk GOR baru ditemukan bila pencarian dipersempit.
      expect(kodeDiDaftarProduk(await render({ cari: gor }))).toEqual([gor]);
    });

    it("filter status + cari bekerja bersama; berpindah filter mempertahankan pencarian", async () => {
      const admin = await kepalaPenggunaUji("admin");
      kepala.cookie = admin.cookie;
      const awalan = `FLT${acak()}`;
      const keluarga = await buatKeluargaDenganSegmen(`SEG${acak()}`);
      const [satu, dua, tiga] = [`${awalan}-1`, `${awalan}-2`, `${awalan}-3`];
      for (const k of [satu, dua, tiga]) await buatProduk(k);
      await terapkanPemetaan(admin.id, [{ kodeProduk: dua, tujuan: { status: "terpetakan", idKeluarga: keluarga.id } }]);

      expect(kodeDiDaftarProduk(await render({ cari: awalan }))).toEqual([satu, dua, tiga]);
      expect(kodeDiDaftarProduk(await render({ cari: awalan, status: "terpetakan" }))).toEqual([dua]);
      const belum = await render({ cari: awalan, status: "belum-dipetakan" });
      expect(kodeDiDaftarProduk(belum)).toEqual([satu, tiga]);
      // Chip filter membawa pencarian dan kembali ke halaman 1; kotak cari membawa filter status.
      expect(belum).toContain(`href="/admin/pemetaan-produk?status=terpetakan&amp;cari=${awalan}&amp;cariUsulan=${TAG}"`);
      expect(belum).toMatch(/<form[^>]*data-kotak-cari="cari"[^>]*>.*?<input type="hidden" name="status" value="belum-dipetakan"/);
    });

    it("konfirmasi pemetaan dari halaman 2 berhasil dan halaman tetap di halaman 2", async () => {
      kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
      const awalan = `KNF${acak()}`;
      const kode = await buatEnamPuluhProduk(awalan);
      const target = kode[54];

      const sebelum = await render({ cari: awalan, halaman: "2" });
      const barisTarget = barisDengan(sebelum, target).find((b) => b.includes(`data-produk="${target}"`)) ?? "";
      expect(barisTarget).toContain(`Konfirmasi<span class="sr-only"> pemetaan ${target}</span>`);

      // Form konfirmasi memanggil aksi server langsung (tanpa navigasi), jadi alamat halaman tidak berubah.
      const hasil = await konfirmasiPemetaan({ butir: [{ kodeProduk: target, tujuan: { status: "tanpa-aroma" } }] });
      expect(hasil).toMatchObject({ keadaan: "berhasil", hasil: [{ kodeProduk: target, status: "berhasil" }] });

      const sesudah = await render({ cari: awalan, halaman: "2" });
      expect(kodeDiDaftarProduk(sesudah)).toEqual(kode.slice(50));
      expect(navigasi(sesudah, "Halaman daftar produk")).toContain("Halaman 2 dari 2");
      const barisSesudah = barisDengan(sesudah, target).find((b) => b.includes(`data-produk="${target}"`)) ?? "";
      expect(barisSesudah).toContain('data-status-pemetaan="tanpa-aroma"');
    });

    it("daftar usulan punya kotak cari dan halaman 50 baris sendiri", async () => {
      kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
      const segmen = `USL${acak()}`;
      await buatKeluargaDenganSegmen(segmen);
      const kode = await buatEnamPuluhProduk(`DW110E-${segmen}`);
      const usulanDi = (html: string) => [...html.matchAll(/<tr[^>]*data-usulan="([^"]+)"/g)].map((m) => m[1]);

      const halaman1 = await render({ cariUsulan: segmen });
      expect(usulanDi(halaman1)).toEqual(kode.slice(0, 50));
      expect(navigasi(halaman1, "Halaman daftar usulan")).toContain("Baris 1–50 dari 60 · Halaman 1 dari 2");
      expect(usulanDi(await render({ cariUsulan: segmen, halamanUsulan: "2" }))).toEqual(kode.slice(50));
      expect(halaman1).toMatch(/<form[^>]*data-kotak-cari="cariUsulan"/);
    });
  });
});
