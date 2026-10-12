import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseTanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { jadwalToko } from "@/server/db/schema";

import { bacaDraftRencana, bacaRingkasanDraft, hitungDraftRencana } from "./draft-rencana";
import { bacaRencanaFinal, finalisasiRencanaToko } from "./rencana-final";
import { simpanStokToko } from "./stok-draft";
import { bersihkanTokoSmbUji, siapkanTokoSmbUji } from "./uji-bantu-cakupan";
import { idGudangUji } from "./uji-bantu";

// T91: panjang cakupan L = jarak ke tanggal kirim berikutnya menurut jadwal aktif (PRD A6 ▶ Revisi 2026-10-12, UAT
// ketiga). Contoh SMB: kirim Senin → cakupan Senin–Rabu (L = 3, p = 0), kebutuhan 15; kirim Kamis → cakupan Rabu–Minggu
// (L = 4, p = 1), kebutuhan 30.

const SENIN = parseTanggalBisnis("2026-10-19");
const KAMIS = parseTanggalBisnis("2026-10-22");

let idAdmin: string;
let idOperator: string;
let bandung: number;
let toko: { id: number; nama: string };
let kodeProduk: string;

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  bandung = await idGudangUji("Gudang Bandung");
  ({ toko, kodeProduk } = await siapkanTokoSmbUji({ idGudang: bandung, idAdmin }));
}, 120_000);

afterAll(async () => {
  await bersihkanTokoSmbUji({ idGudang: bandung, idToko: toko.id });
});

async function tokoDraft(tanggalKirim: typeof SENIN) {
  expect(await hitungDraftRencana({ idGudang: bandung, tanggalKirim, idPengguna: idOperator })).toMatchObject({ keadaan: "berhasil" });
  return (await bacaDraftRencana(bandung, tanggalKirim))?.toko.find((t) => t.id === toko.id);
}

describe("draft rencana menyimpan panjang cakupan hasil hitung dari jadwal", () => {
  it("SMB kirim Senin 2026-10-19 → panjang cakupan 3, cakupan Senin–Rabu, kebutuhan 15", async () => {
    const hasil = await tokoDraft(SENIN);
    expect(hasil).toMatchObject({ persiapanHari: 0, panjangCakupan: 3 });
    expect(hasil?.cakupan?.map((c) => c.tanggal)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    expect(hasil?.baris.find((b) => b.kodeProduk === kodeProduk)).toMatchObject({ klasifikasi: "otomatis", kebutuhan: 15 });
  });

  it("SMB kirim Kamis 2026-10-22 → panjang cakupan 4, cakupan Rabu–Minggu, kebutuhan 30", async () => {
    const hasil = await tokoDraft(KAMIS);
    expect(hasil).toMatchObject({ persiapanHari: 1, panjangCakupan: 4 });
    expect(hasil?.cakupan?.map((c) => c.tanggal)).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(hasil?.baris.find((b) => b.kodeProduk === kodeProduk)).toMatchObject({ klasifikasi: "otomatis", kebutuhan: 30 });
  });

  it("rencana final menyimpan panjang cakupan hasil hitung sebagai snapshot", async () => {
    await tokoDraft(KAMIS);
    expect(await simpanStokToko({ idGudang: bandung, tanggalKirim: KAMIS, tokoId: toko.id, stok: [{ kodeProduk, stokAkhir: 10 }] })).toEqual({
      keadaan: "berhasil",
    });
    const versiDilihat = (await bacaDraftRencana(bandung, KAMIS))?.toko.find((t) => t.id === toko.id)?.versi ?? "";
    const hasil = await finalisasiRencanaToko({ idGudang: bandung, tanggalKirim: KAMIS, tokoId: toko.id, idPengguna: idOperator, versiDilihat });
    if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
    const rencana = await bacaRencanaFinal(bandung, hasil.idRencana);
    expect(rencana?.jadwal).toMatchObject({ pola: "2x-seminggu", persiapanHari: 1, panjangCakupan: 4 });
    expect(rencana?.kalender.cakupan.map((c) => c.tanggal)).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  });
});

describe("draft rencana pola 1× sebulan menyimpan panjang cakupan 30 (T92, PRD A6 ▶ Revisi 2026-10-12)", () => {
  it("1× sebulan Senin (H−1), kirim Senin pertama November 2026-11-02 → panjang cakupan 30, cakupan 2026-11-01 s.d. 2026-12-01", async () => {
    await db
      .update(jadwalToko)
      .set({ pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapanHari: 1 }], tanggalJangkar: null })
      .where(eq(jadwalToko.tokoId, toko.id));
    const hasil = await tokoDraft(parseTanggalBisnis("2026-11-02"));
    expect(hasil).toMatchObject({ persiapanHari: 1, panjangCakupan: 30 });
    const cakupan = hasil?.cakupan?.map((c) => c.tanggal) ?? [];
    expect([cakupan.length, cakupan[0], cakupan.at(-1)]).toEqual([31, "2026-11-01", "2026-12-01"]);
    // Senin–Kamis 18 × 5 + Jumat 4 × 5 + Sabtu 4 × 8 + Minggu 5 × 7 (jumlah hari sheet PHASE 2 workbook pemilik).
    expect(hasil?.baris.find((b) => b.kodeProduk === kodeProduk)).toMatchObject({ klasifikasi: "otomatis", kebutuhan: 177 });
  });
});

describe('draft rencana: peringatan "kiriman sebelumnya belum sampai" dari jadwal versi draft (T93, PRD A6 ▶ Keputusan 2026-10-12)', () => {
  const SELASA = parseTanggalBisnis("2026-10-20");

  it("3× seminggu Senin (H−1), Selasa (H−1), Jumat (H): kirim Selasa 2026-10-20 → kiriman Senin 2026-10-19 belum sampai", async () => {
    await db
      .update(jadwalToko)
      .set({
        pola: "3x-seminggu",
        hariKirim: [
          { hari: "Senin", persiapanHari: 1 },
          { hari: "Selasa", persiapanHari: 1 },
          { hari: "Jumat", persiapanHari: 0 },
        ],
        tanggalJangkar: null,
      })
      .where(eq(jadwalToko.tokoId, toko.id));
    expect(await tokoDraft(SELASA)).toMatchObject({ persiapanHari: 1, kirimanSebelumnyaBelumSampai: "2026-10-19" });
    const ringkasan = await bacaRingkasanDraft(bandung, SELASA, toko.id);
    expect(ringkasan?.tokoDibuka).toMatchObject({ id: toko.id, kirimanSebelumnyaBelumSampai: "2026-10-19" });
  });

  it("SMB kirim Kamis 2026-10-22 (p = 1, jarak 3) → tidak ada peringatan", async () => {
    await db
      .update(jadwalToko)
      .set({
        pola: "2x-seminggu",
        hariKirim: [
          { hari: "Senin", persiapanHari: 0 },
          { hari: "Kamis", persiapanHari: 1 },
        ],
        tanggalJangkar: null,
      })
      .where(eq(jadwalToko.tokoId, toko.id));
    expect(await tokoDraft(KAMIS)).toMatchObject({ kirimanSebelumnyaBelumSampai: null });
  });

  it("jadwal yang berubah sesudah draft dihitung tidak mengubah peringatan draft itu", async () => {
    await db
      .update(jadwalToko)
      .set({
        pola: "3x-seminggu",
        hariKirim: [
          { hari: "Senin", persiapanHari: 1 },
          { hari: "Selasa", persiapanHari: 1 },
          { hari: "Jumat", persiapanHari: 0 },
        ],
      })
      .where(eq(jadwalToko.tokoId, toko.id));
    await tokoDraft(SELASA);
    await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idAdmin, dinonaktifkanPada: new Date() })
      .where(eq(jadwalToko.tokoId, toko.id));
    await db.insert(jadwalToko).values({
      tokoId: toko.id,
      pola: "mingguan",
      hariKirim: [{ hari: "Selasa", persiapanHari: 1 }],
      dibuatOleh: idAdmin,
    });
    const hasil = (await bacaDraftRencana(bandung, SELASA))?.toko.find((t) => t.id === toko.id);
    expect(hasil).toMatchObject({ perluDihitungUlang: ["jadwal"], kirimanSebelumnyaBelumSampai: "2026-10-19" });
  });
});
