import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { rencanaFinal, toko } from "@/server/db/schema";
import { buatGudangUji, buatTokoUji, hapusGudangUji, rencanaFinalUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanRiwayatRencanaFinal from "./page";

// T119 (DESIGN §11.1, §11.9): riwayat rencana final bisa dicari (nama toko) dan dibagi per halaman 50 baris, keadaannya
// di URL bersama filter tanggal kirim dan toko. Versi yang sudah digantikan berlabel "Digantikan oleh versi n" di samping
// status Final. Data: 60 rencana final di gudang uji sendiri — 58 toko lain (satu per tanggal kirim) dan MKG versi 1 dan
// 2 pada tanggal kirim paling lama (jadi tampil di halaman 2).

const acak = randomUUID().slice(0, 8).toUpperCase();
const TANGGAL_MKG = "2029-12-31";
let idGudang: number;
let mkg: { id: number; nama: string };
const id = { mkgV1: 0, mkgV2: 0 };
/** Id rencana final urut tampil yang diharapkan: tanggal kirim terbaru di atas, lalu versi terbaru. */
let urutan: number[] = [];

beforeAll(async () => {
  const pengguna = await buatPenggunaUji("admin");
  idGudang = (await buatGudangUji()).id;
  const lain = await buatTokoUji();
  [mkg] = await db.insert(toko).values({ nama: `MKG ${acak}` }).returning({ id: toko.id, nama: toko.nama });

  await rencanaFinalUji({ idGudang, idToko: lain.id, tanggalKirim: "2030-03-31", idPengguna: pengguna.id });
  const [dasar] = await db.select().from(rencanaFinal).where(eq(rencanaFinal.gudangId, idGudang));
  const nilaiDasar: Omit<typeof dasar, "id"> & { id?: number } = { ...dasar };
  delete nilaiDasar.id;

  const tanggalLain = [
    ...Array.from({ length: 31 }, (_, i) => `2030-01-${String(i + 1).padStart(2, "0")}`),
    ...Array.from({ length: 26 }, (_, i) => `2030-02-${String(i + 1).padStart(2, "0")}`),
  ];
  const tokoLain = await db
    .insert(rencanaFinal)
    .values(tanggalLain.map((tanggalKirim) => ({ ...nilaiDasar, namaToko: lain.nama, tanggalKirim })))
    .returning({ id: rencanaFinal.id, tanggalKirim: rencanaFinal.tanggalKirim });
  const [v1, v2] = await db
    .insert(rencanaFinal)
    .values(
      [1, 2].map((versi) => ({
        ...nilaiDasar,
        tokoId: mkg.id,
        namaToko: mkg.nama,
        tanggalKirim: TANGGAL_MKG,
        versi,
        alasanFinalisasiUlang: versi === 1 ? null : "Uji T119",
      })),
    )
    .returning({ id: rencanaFinal.id });
  id.mkgV1 = v1.id;
  id.mkgV2 = v2.id;
  urutan = [
    dasar.id,
    ...tokoLain.sort((a, b) => b.tanggalKirim.localeCompare(a.tanggalKirim)).map((r) => r.id),
    id.mkgV2,
    id.mkgV1,
  ];
}, 60_000);

afterAll(async () => {
  await hapusGudangUji(idGudang);
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
});

const buka = async (parameter: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await HalamanRiwayatRencanaFinal({ params: Promise.resolve({ id: String(idGudang) }), searchParams: Promise.resolve(parameter) }),
  );
const idDiDaftar = (html: string) => [...html.matchAll(/<tr[^>]*data-rencana-final="(\d+)"/g)].map((m) => Number(m[1]));
const baris = (html: string, idRencana: number) => new RegExp(`<tr[^>]*data-rencana-final="${idRencana}".*?</tr>`).exec(html)?.[0] ?? "";

describe("riwayat rencana final: halaman 50 baris + cari (T119)", () => {
  it("50 baris per halaman; halaman 2 berisi sisanya; navigasi membawa filter dan cari", async () => {
    expect(urutan).toHaveLength(60);
    const halaman1 = await buka();
    expect(idDiDaftar(halaman1)).toEqual(urutan.slice(0, 50));
    expect(halaman1).toContain("Baris 1–50 dari 60 · Halaman 1 dari 2");
    expect(halaman1).toContain(`href="/pengiriman-gudang/${idGudang}/rencana-final?halaman=2"`);

    const halaman2 = await buka({ halaman: "2" });
    expect(idDiDaftar(halaman2)).toEqual(urutan.slice(50));
    expect(halaman2).toContain("Baris 51–60 dari 60 · Halaman 2 dari 2");
    expect(halaman2).toContain(`href="/pengiriman-gudang/${idGudang}/rencana-final"`);

    // Halaman di luar jangkauan dibatasi ke halaman terakhir.
    expect(idDiDaftar(await buka({ halaman: "9" }))).toEqual(urutan.slice(50));
  });

  it("cari nama toko menyaring; bekerja bersama filter tanggal kirim; isian cari ada di form filter", async () => {
    const html = await buka({ cari: `mkg ${acak.toLowerCase()}` });
    expect(idDiDaftar(html)).toEqual([id.mkgV2, id.mkgV1]);
    expect(html).toMatch(new RegExp(`<form[^>]*data-filter-rencana-final.*?name="cari"[^>]*value="mkg ${acak.toLowerCase()}"`));
    expect(idDiDaftar(await buka({ cari: "MKG", tanggal: TANGGAL_MKG }))).toEqual([id.mkgV2, id.mkgV1]);
    expect(idDiDaftar(await buka({ cari: `MKG ${acak}`, tanggal: "2030-01-05" }))).toEqual([]);
    expect(await buka({ cari: `TIDAK ADA ${acak}` })).toContain("Tidak ada rencana final yang cocok dengan filter ini.");
  });

  it('MKG versi 1 dan 2 → versi 1 berlabel "Digantikan oleh versi 2" di samping status Final; versi 2 tidak', async () => {
    const html = await buka({ cari: `MKG ${acak}` });
    expect(baris(html, id.mkgV1)).toMatch(/data-status="final".*?Final.*?data-digantikan-oleh="2"[^>]*>Digantikan oleh versi 2</);
    expect(baris(html, id.mkgV2)).toMatch(/data-status="final".*?Final/);
    expect(baris(html, id.mkgV2)).not.toContain("Digantikan");
    // Toko lain dengan satu versi per tanggal kirim tidak berlabel.
    const halaman1 = await buka();
    expect(urutan.slice(0, 50).some((r) => baris(halaman1, r).includes("Digantikan"))).toBe(false);
    // Label tetap tampil di halaman 2 tanpa pencarian.
    expect(baris(await buka({ halaman: "2" }), id.mkgV1)).toContain("Digantikan oleh versi 2");
  });
});
