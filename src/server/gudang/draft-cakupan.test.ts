import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseTanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";

import { bacaDraftRencana, hitungDraftRencana } from "./draft-rencana";
import { bacaRencanaFinal, finalisasiRencanaToko } from "./rencana-final";
import { simpanStokToko } from "./stok-draft";
import { bersihkanTokoSmbUji, siapkanTokoSmbUji } from "./uji-bantu-cakupan";
import { idGudangUji } from "./uji-bantu";

// T91: panjang cakupan L = jarak ke tanggal kirim berikutnya menurut jadwal aktif (PRD A6 ▶ Revisi 2026-10-12, UAT
// ketiga). Contoh SMB: kirim Senin → cakupan Senin–Rabu (L = 3, p = 0), kebutuhan 15; kirim Kamis → cakupan Rabu–Minggu
// (L = 4, p = 1), kebutuhan 30.

const SENIN = parseTanggalBisnis("2026-10-19");
const KAMIS = parseTanggalBisnis("2026-10-22");

let idOperator: string;
let bandung: number;
let toko: { id: number; nama: string };
let kodeProduk: string;

beforeAll(async () => {
  const idAdmin = (await buatPenggunaUji("admin")).id;
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
