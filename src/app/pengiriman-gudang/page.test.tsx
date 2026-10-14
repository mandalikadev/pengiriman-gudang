import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatGudangUji, buatTokoUji, hapusGudangUji, idGudangUji, rencanaFinalUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
// "Hari ini" dibaca dari jam server (WIB); dipatok agar test tidak bergantung pada tanggal menjalankan test.
const jam = vi.hoisted(() => ({ hariIni: "2026-10-13" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("@/app/admin/impor/format", async (asli) => {
  const modul = await asli<typeof import("@/app/admin/impor/format")>();
  return { ...modul, tanggalWib: () => jam.hariIni };
});

import HalamanDaftarPengirimanGudang from "./page";

let bali: number;
let bandung: number;
const gudangDibuat: number[] = [];

beforeAll(async () => {
  bali = await idGudangUji("Gudang Bali");
  bandung = await idGudangUji("Gudang Bandung");
});

afterAll(async () => {
  await hapusGudangUji(...gudangDibuat);
});

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async () => renderToStaticMarkup(await HalamanDaftarPengirimanGudang());

/** Tautan gudang di daftar: [id, isi teks]. */
function kartuGudang(html: string) {
  return [...html.matchAll(/<a [^>]*href="\/pengiriman-gudang\/(\d+)"[^>]*>(.*?)<\/a>/g)].map((m) => ({
    id: Number(m[1]),
    teks: m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));
}

describe("/pengiriman-gudang", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanDaftarPengirimanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer tanpa penugasan ditolak (404)", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanDaftarPengirimanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("operator hanya melihat gudang penugasannya; tanpa hak tindakan ditandai hanya-baca", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bali, hakTindakan: [] });
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bandung, hakTindakan: ["input-stok"] });
    kepala.cookie = operator.cookie;

    const html = await buka();
    const kartu = kartuGudang(html);
    expect(kartu.map((k) => k.id)).toEqual([bali, bandung]);
    expect(kartu[0]!.teks).toMatch(/^Gudang Bali Hanya-baca /);
    expect(kartu[1]!.teks).toMatch(/^Gudang Bandung /);
    expect(kartu[1]!.teks).not.toContain("Hanya-baca");
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("admin tanpa penugasan melihat kelima gudang, semuanya hanya-baca", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const kartu = kartuGudang(await buka());
    expect(kartu.map((k) => /^(.*?) Hanya-baca /.exec(k.teks)?.[1])).toEqual([
      "Pusat",
      "Gudang Bali",
      "Gudang Bandung",
      "Gudang Cibubur",
      "Gudang Jabodetabek",
    ]);
  });

  // T118 (DESIGN §11.5): operator dengan tepat satu gudang langsung masuk; dua gudang atau admin melihat daftar.
  it("operator dengan satu gudang diarahkan ke /pengiriman-gudang/<id>", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bali, hakTindakan: [] });
    kepala.cookie = operator.cookie;
    await expect(HalamanDaftarPengirimanGudang()).rejects.toMatchObject({
      digest: expect.stringContaining(`;/pengiriman-gudang/${bali};`),
    });
  });

  it("kartu gudang menampilkan tanggal kirim terdekat dan jumlah toko yang belum final untuk tanggal itu", async () => {
    // Hari ini Selasa, 13-10-2026. Gudang uji: tiga toko Kamis (satu sudah final untuk 15-10) dan satu toko Senin.
    const idAdmin = (await buatPenggunaUji("admin")).id;
    const [berjadwal, kosong, semuaFinal] = [await buatGudangUji(), await buatGudangUji(), await buatGudangUji()];
    gudangDibuat.push(berjadwal.id, kosong.id, semuaFinal.id);
    const tokoKamis = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
    const tokoSenin = await buatTokoUji();
    const tokoFinal = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values([
      ...[...tokoKamis, tokoSenin].map((t) => ({ tokoId: t.id, gudangId: berjadwal.id })),
      { tokoId: tokoFinal.id, gudangId: semuaFinal.id },
    ]);
    await db.insert(jadwalToko).values([
      ...[...tokoKamis, tokoFinal].map((t) => ({
        tokoId: t.id,
        pola: "mingguan" as const,
        hariKirim: [{ hari: "Kamis" as const, persiapanHari: 0 as const }],
        dibuatOleh: idAdmin,
      })),
      { tokoId: tokoSenin.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 0 }], dibuatOleh: idAdmin },
    ]);
    await rencanaFinalUji({ idGudang: berjadwal.id, idToko: tokoKamis[0]!.id, tanggalKirim: "2026-10-15", idPengguna: idAdmin });
    await rencanaFinalUji({ idGudang: semuaFinal.id, idToko: tokoFinal.id, tanggalKirim: "2026-10-15", idPengguna: idAdmin });

    const operator = await kepalaPenggunaUji("viewer");
    for (const g of [berjadwal, kosong, semuaFinal]) {
      await tugaskanOperator({ idPengguna: operator.id, idGudang: g.id, hakTindakan: ["finalisasi"] });
    }
    kepala.cookie = operator.cookie;

    const html = await buka();
    expect(kartuGudang(html)).toEqual([
      { id: berjadwal.id, teks: `${berjadwal.nama} Kirim terdekat Kamis, 15-10-2026 2 toko belum final` },
      { id: kosong.id, teks: `${kosong.nama} Belum ada tanggal kirim terdekat` },
      { id: semuaFinal.id, teks: `${semuaFinal.nama} Kirim terdekat Kamis, 15-10-2026 Semua toko sudah final` },
    ]);
    // Ikon + teks (DESIGN §7).
    expect(html).toMatch(/data-jumlah-belum-final="2"[^>]*>.*?lucide-clipboard-list.*?2 toko belum final</);
    expect(html).toMatch(/data-jumlah-belum-final="0"[^>]*>.*?lucide-circle-check.*?Semua toko sudah final</);
  });
});
