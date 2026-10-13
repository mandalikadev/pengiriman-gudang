import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, pengirimanDiLuarJadwal } from "@/server/db/schema";

import { bacaDraftRencana, bacaRingkasanDraft, hitungDraftRencana } from "./draft-rencana";
import {
  batalkanPengirimanDiLuarJadwal,
  setujuiPengirimanDiLuarJadwal,
  usulkanPengirimanDiLuarJadwal,
  type IsianPengirimanDiLuarJadwal,
} from "./pengiriman-di-luar-jadwal";
import { bacaRencanaFinal, finalisasiRencanaToko } from "./rencana-final";
import { simpanStokToko } from "./stok-draft";
import { bersihkanTokoSmbUji, siapkanTokoSmbUji } from "./uji-bantu-cakupan";
import { idGudangUji } from "./uji-bantu";

// T114 (PRD A5 ▶ Revisi 2026-10-13, Ikut perhitungan seperti pengiriman biasa; A6 ▶ Revisi 2026-10-13): pengiriman di luar
// jadwal yang berlaku masuk draft tanggalnya, memendekkan cakupan pengiriman sebelumnya, memicu peringatan, dan menandai
// draft terdampak perlu dihitung ulang. Contoh BOTANI: jadwal tetap 2× seminggu Senin (H), Kamis (H−1); tambahan Selasa
// 2026-10-20 (H−1) di Gudang Cibubur (perlu persetujuan admin).

const KAMIS_LALU = parseTanggalBisnis("2026-10-15");
const SENIN = parseTanggalBisnis("2026-10-19");
const SELASA = parseTanggalBisnis("2026-10-20");
const KAMIS = parseTanggalBisnis("2026-10-22");
/** Tanggal "hari ini" untuk syarat usulan: sebelum semua tanggal kirim contoh. */
const HARI_INI = parseTanggalBisnis("2026-10-01");
const ALASAN = "Stok BOTANI menipis jelang promo";

let idAdmin: string;
let idOperator: string;
let cibubur: number;
let toko: { id: number; nama: string };
let kodeProduk: string;

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  cibubur = await idGudangUji("Gudang Cibubur");
  ({ toko, kodeProduk } = await siapkanTokoSmbUji({ idGudang: cibubur, idAdmin }));
}, 120_000);

afterAll(async () => {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  await db.delete(pengirimanDiLuarJadwal).where(eq(pengirimanDiLuarJadwal.tokoId, toko.id));
  await bersihkanTokoSmbUji({ idGudang: cibubur, idToko: toko.id });
});

const hitung = async (tanggalKirim: TanggalBisnis) =>
  expect(await hitungDraftRencana({ idGudang: cibubur, tanggalKirim, idPengguna: idOperator })).toMatchObject({ keadaan: "berhasil" });
const draft = (tanggalKirim: TanggalBisnis) => bacaDraftRencana(cibubur, tanggalKirim);
const tokoDi = async (tanggalKirim: TanggalBisnis) => (await draft(tanggalKirim))?.toko.find((t) => t.id === toko.id);

/** Usulan operator di Gudang Cibubur lalu disetujui admin; mengembalikan id pengiriman. */
async function berlakukan(isian: Omit<IsianPengirimanDiLuarJadwal, "idToko" | "alasan">) {
  const usul = await usulkanPengirimanDiLuarJadwal({
    idGudang: cibubur,
    isian: { ...isian, idToko: toko.id, alasan: ALASAN },
    idPengguna: idOperator,
    hariIni: HARI_INI,
  });
  if (usul.keadaan !== "berhasil") throw new Error(usul.pesan);
  const [{ id }] = await db
    .select({ id: pengirimanDiLuarJadwal.id })
    .from(pengirimanDiLuarJadwal)
    .where(and(eq(pengirimanDiLuarJadwal.tokoId, toko.id), eq(pengirimanDiLuarJadwal.status, "menunggu")));
  const setuju = await setujuiPengirimanDiLuarJadwal({ id, idPengguna: idAdmin, hariIni: HARI_INI });
  if (setuju.keadaan !== "berhasil") throw new Error(setuju.pesan);
  return id;
}

async function batalkan(id: number) {
  const hasil = await batalkanPengirimanDiLuarJadwal({ id, alasan: "Promo dibatalkan", idPengguna: idAdmin, hariIni: HARI_INI, gudangOperator: null });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
}

describe("tambahan Selasa 2026-10-20 (H−1) ikut perhitungan seperti pengiriman biasa", () => {
  let idTambahan: number;

  it("sebelum tambahan berlaku: Senin L = 3, Kamis L = 4; Selasa bukan tanggal kirim BOTANI", async () => {
    await hitung(SENIN);
    await hitung(SELASA);
    await hitung(KAMIS);
    expect(await tokoDi(SENIN)).toMatchObject({ panjangCakupan: 3, diLuarJadwal: null, perluDihitungUlang: [] });
    expect(await tokoDi(SELASA)).toBeUndefined();
    expect(await tokoDi(KAMIS)).toMatchObject({ panjangCakupan: 4, kirimanSebelumnyaBelumSampai: null });
  });

  it("setelah tambahan berlaku: draft Senin dan Selasa ditandai perlu dihitung ulang, draft Kamis tidak", async () => {
    idTambahan = await berlakukan({ jenis: "tambahan", tanggalKirim: SELASA, persiapanHari: 1, tanggalRutinDipindah: null });
    expect((await draft(SENIN))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect(await tokoDi(SENIN)).toMatchObject({ panjangCakupan: 3, perluDihitungUlang: ["jadwal"] });
    // Toko baru di draft Selasa: draft perlu dihitung ulang.
    expect((await draft(SELASA))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect((await draft(KAMIS))?.perluDihitungUlang).toEqual([]);
  });

  it("dihitung ulang: Senin L = 1 (cakupan Senin saja), stok yang sudah diisi dipertahankan", async () => {
    expect(await simpanStokToko({ idGudang: cibubur, tanggalKirim: SENIN, tokoId: toko.id, stok: [{ kodeProduk, stokAkhir: 4 }] })).toEqual({
      keadaan: "berhasil",
    });
    await hitung(SENIN);
    const senin = await tokoDi(SENIN);
    expect(senin).toMatchObject({ persiapanHari: 0, panjangCakupan: 1, diLuarJadwal: null, perluDihitungUlang: [] });
    expect(senin?.cakupan?.map((c) => c.tanggal)).toEqual(["2026-10-19"]);
    expect(senin?.baris.find((b) => b.kodeProduk === kodeProduk)).toMatchObject({ stokAkhir: 4 });
  });

  it("draft Selasa memuat BOTANI dengan penanda Tambahan: p = 1, L = 2 (19–21 Oktober), peringatan Senin 19-10-2026", async () => {
    await hitung(SELASA);
    const selasa = await tokoDi(SELASA);
    expect(selasa).toMatchObject({
      persiapanHari: 1,
      panjangCakupan: 2,
      kirimanSebelumnyaBelumSampai: "2026-10-19",
      perluDihitungUlang: [],
      diLuarJadwal: { id: idTambahan, jenis: "tambahan", tanggalRutinDipindah: null, alasan: ALASAN, pengusul: "Uji viewer", penyetuju: "Uji admin" },
    });
    expect(selasa?.cakupan?.map((c) => c.tanggal)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    const ringkasan = await bacaRingkasanDraft(cibubur, SELASA, toko.id);
    expect(ringkasan?.toko.find((t) => t.id === toko.id)?.diLuarJadwal).toMatchObject({ jenis: "tambahan", alasan: ALASAN });
    expect(ringkasan?.tokoDibuka?.diLuarJadwal).toMatchObject({ jenis: "tambahan", penyetuju: "Uji admin" });
  });

  it("Kamis 2026-10-22 tidak berubah: L = 4, tanpa peringatan", async () => {
    await hitung(KAMIS);
    expect(await tokoDi(KAMIS)).toMatchObject({ persiapanHari: 1, panjangCakupan: 4, kirimanSebelumnyaBelumSampai: null, diLuarJadwal: null });
  });

  it("membatalkan tambahan menandai draft Senin dan Selasa perlu dihitung ulang; setelah dihitung ulang toko keluar dari draft Selasa", async () => {
    await batalkan(idTambahan);
    expect((await draft(SENIN))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect((await draft(SELASA))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect((await draft(KAMIS))?.perluDihitungUlang).toEqual([]);

    await hitung(SELASA);
    const selasa = await draft(SELASA);
    expect(selasa?.toko.some((t) => t.id === toko.id)).toBe(false);
    expect(selasa?.tokoDikeluarkan).toContainEqual({ id: toko.id, nama: toko.nama });
    await hitung(SENIN);
    expect(await tokoDi(SENIN)).toMatchObject({ panjangCakupan: 3, perluDihitungUlang: [] });
  });
});

describe("pindah Senin 2026-10-19 → Selasa 2026-10-20 (H)", () => {
  let idPindah: number;
  let idRabu: number;

  it("draft Kamis 15-10 (L berubah), Senin 19-10 (tanggal rutin yang dipindah), dan Selasa ditandai; Kamis 22-10 (peringatan tetap) tidak", async () => {
    await hitung(KAMIS_LALU);
    await hitung(SENIN);
    await hitung(SELASA);
    await hitung(KAMIS);
    expect(await tokoDi(KAMIS_LALU)).toMatchObject({ panjangCakupan: 4 });

    idPindah = await berlakukan({ jenis: "pindah", tanggalKirim: SELASA, persiapanHari: 0, tanggalRutinDipindah: SENIN });
    expect((await draft(KAMIS_LALU))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect((await draft(SENIN))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect((await draft(SELASA))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect((await draft(KAMIS))?.perluDihitungUlang).toEqual([]);
  });

  it("dihitung ulang: Kamis 15-10 L = 5, toko keluar dari draft Senin, Selasa L = 2 dengan penanda Pindahan dari Senin", async () => {
    await hitung(KAMIS_LALU);
    expect(await tokoDi(KAMIS_LALU)).toMatchObject({ panjangCakupan: 5, perluDihitungUlang: [] });
    await hitung(SENIN);
    const senin = await draft(SENIN);
    expect(senin?.toko.some((t) => t.id === toko.id)).toBe(false);
    expect(senin?.tokoDikeluarkan).toContainEqual({ id: toko.id, nama: toko.nama });
    await hitung(SELASA);
    expect(await tokoDi(SELASA)).toMatchObject({
      persiapanHari: 0,
      panjangCakupan: 2,
      kirimanSebelumnyaBelumSampai: null,
      diLuarJadwal: { id: idPindah, jenis: "pindah", tanggalRutinDipindah: "2026-10-19" },
    });
  });

  it("peringatan yang berubah menandai draft pengiriman berikutnya: tambahan Rabu 21-10 (H−1) → Kamis 22-10 (H−1) berperingatan", async () => {
    await batalkan(idPindah);
    await hitung(SENIN);
    await hitung(SELASA);
    await hitung(KAMIS);
    // Tambahan Rabu 21-10 (H−1): persiapan Selasa; Kamis 22-10 (H−1) kini berperingatan "Kiriman Rabu, 21-10-2026".
    idRabu = await berlakukan({ jenis: "tambahan", tanggalKirim: parseTanggalBisnis("2026-10-21"), persiapanHari: 1, tanggalRutinDipindah: null });
    expect((await draft(KAMIS))?.perluDihitungUlang).toEqual(["jadwal"]);
    await hitung(KAMIS);
    expect(await tokoDi(KAMIS)).toMatchObject({ panjangCakupan: 4, kirimanSebelumnyaBelumSampai: "2026-10-21", perluDihitungUlang: [] });
    await batalkan(idRabu);
  });
});

describe("rencana final dan pengiriman di luar jadwal (snapshot)", () => {
  async function finalisasi(tanggalKirim: TanggalBisnis) {
    expect(await simpanStokToko({ idGudang: cibubur, tanggalKirim, tokoId: toko.id, stok: [{ kodeProduk, stokAkhir: 1 }] })).toEqual({
      keadaan: "berhasil",
    });
    const versiDilihat = (await tokoDi(tanggalKirim))?.versi ?? "";
    const hasil = await finalisasiRencanaToko({ idGudang: cibubur, tanggalKirim, tokoId: toko.id, idPengguna: idOperator, versiDilihat });
    if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
    return hasil.idRencana;
  }

  it("rencana final yang dibuat sebelum pengiriman di luar jadwal berlaku tidak berubah; finalisasi tambahan menyimpan jenis, alasan, pengusul, dan penyetuju", async () => {
    // Semua pengiriman di luar jadwal sebelumnya sudah dibatalkan: Senin kembali L = 3.
    await hitung(SENIN);
    const idSenin = await finalisasi(SENIN);
    const seninSebelum = await bacaRencanaFinal(cibubur, idSenin);
    expect(seninSebelum).toMatchObject({ jadwal: { panjangCakupan: 3 }, diLuarJadwal: null });

    const idTambahan = await berlakukan({ jenis: "tambahan", tanggalKirim: SELASA, persiapanHari: 1, tanggalRutinDipindah: null });
    expect(await bacaRencanaFinal(cibubur, idSenin)).toEqual(seninSebelum);

    await hitung(SELASA);
    const idSelasa = await finalisasi(SELASA);
    const selasa = await bacaRencanaFinal(cibubur, idSelasa);
    expect(selasa).toMatchObject({
      jadwal: { persiapanHari: 1, panjangCakupan: 2 },
      diLuarJadwal: {
        id: idTambahan,
        jenis: "tambahan",
        tanggalRutinDipindah: null,
        alasan: ALASAN,
        pengusul: "Uji viewer",
        penyetuju: "Uji admin",
        disetujuiPada: expect.any(Date),
        diusulkanPada: expect.any(Date),
      },
    });
  });
});
