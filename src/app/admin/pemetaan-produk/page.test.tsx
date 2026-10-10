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

import HalamanPemetaanProduk from "./page";

function acak() {
  return randomUUID().slice(0, 8).toUpperCase();
}

async function buatProduk(kode: string) {
  await db
    .insert(produk)
    .values({ kode, nama: `PRODUK ${kode}`, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" });
  return kode;
}

async function buatKeluargaDenganSegmen(segmen: string) {
  const [keluarga] = await db.insert(keluargaAroma).values({ nama: `KELUARGA ${acak()}` }).returning();
  await db.insert(segmenKodeKeluargaAroma).values({ keluargaId: keluarga.id, segmen });
  return keluarga;
}

async function render(status?: string) {
  return renderToStaticMarkup(await HalamanPemetaanProduk({ searchParams: Promise.resolve(status ? { status } : {}) }));
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

    const htmlTerpetakan = await render("terpetakan");
    expect(htmlTerpetakan).toContain('aria-current="page"');
    expect(barisDengan(htmlTerpetakan, terpetakan).some((b) => b.includes('data-status-pemetaan="terpetakan"'))).toBe(true);
    expect(barisDengan(htmlTerpetakan, belum)).toEqual([]);

    const htmlBelum = await render("belum-dipetakan");
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
});
