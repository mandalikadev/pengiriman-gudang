import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { tanggalWib } from "@/app/admin/impor/format";
import { geserHari, namaHari, type NamaHari, type TanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import type { PenggunaMasuk } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import {
  barisDraftRencana,
  draftRencana,
  hubunganTokoGudang,
  impor,
  jadwalToko,
  periodeSumberGudang,
  produk,
  rencanaFinal,
  tokoDraftRencana,
  usulanJadwal,
  versiRanking,
} from "@/server/db/schema";
import type { MasalahBarisDraft } from "@/server/gudang/masalah-draft";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { kunciObjekBaru } from "@/server/impor/impor";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { bacaKunciVersi } from "@/server/laporan/cache";
import { publikasikanRankingUji } from "@/server/ranking/uji-bantu";

import { muatIsiBeranda, type IsiBeranda } from "./isi-beranda";

// Kartu "Mulai di sini" (T94; DESIGN §9 ▶ Keputusan 2026-10-12, UAT ketiga). Database test dipakai bersama berkas lain
// (berurutan), jadi keadaan admin dibentuk relatif: test membuat sendiri hal yang membuat setiap langkah Belum, lalu
// menyelesaikannya. Gudang uji dibersihkan di awal dan akhir.

const hariIni = tanggalWib(new Date());
/** Hari kirim terdekat yang mungkin: hari ini, atau Senin bila hari ini Minggu (Minggu bukan hari kirim, PRD A5). */
const tanggalKirimTerdekat = namaHari(hariIni) === "Minggu" ? geserHari(hariIni, 1) : hariIni;
type HariKirimUji = Exclude<NamaHari, "Minggu">;
const hariKirim = namaHari(tanggalKirimTerdekat) as HariKirimUji;

let admin: PenggunaMasuk;
let cibubur: number;
let jabodetabek: number;
const rencanaFinalUji: number[] = [];

async function bersihkanGudangUji() {
  if (rencanaFinalUji.length > 0) await db.delete(rencanaFinal).where(inArray(rencanaFinal.id, rencanaFinalUji));
  await db.delete(draftRencana).where(inArray(draftRencana.gudangId, [cibubur, jabodetabek]));
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.gudangId, [cibubur, jabodetabek]));
}

beforeAll(async () => {
  const { id } = await buatPenggunaUji("admin");
  admin = { id, nama: "Uji admin", email: "admin@uji.mandalika.test", peran: "admin" };
  cibubur = await idGudangUji("Gudang Cibubur");
  jabodetabek = await idGudangUji("Gudang Jabodetabek");
  await bersihkanGudangUji();
});

afterAll(bersihkanGudangUji);

async function operatorUji(daftarGudang: number[]): Promise<PenggunaMasuk> {
  const { id, email } = await buatPenggunaUji("viewer");
  for (const idGudang of daftarGudang) await tugaskanOperator({ idPengguna: id, idGudang, hakTindakan: [] });
  return { id, nama: "Uji operator", email, peran: "viewer" };
}

/** Langkah daftar admin: jenis → selesai. */
function langkahAdmin(isi: IsiBeranda) {
  const daftar = isi.mulaiDiSini?.find((d) => d.untuk === "admin");
  return daftar?.langkah.map((l) => [l.jenis, l.selesai, l.href]);
}

function daftarGudang(isi: IsiBeranda, idGudang: number) {
  const daftar = isi.mulaiDiSini?.find((d) => d.untuk === "gudang" && d.gudang.id === idGudang);
  if (daftar?.untuk !== "gudang") throw new Error(`Tidak ada daftar untuk gudang ${idGudang}`);
  return daftar;
}

/** Toko aktif uji terhubung ke `idGudang` dengan jadwal mingguan aktif pada `hariKirim` (persiapan H−2). */
async function tokoBerjadwal(idGudang: number) {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: idGudang });
  const [jadwal] = await db
    .insert(jadwalToko)
    .values({ tokoId: t.id, pola: "mingguan", hariKirim: [{ hari: hariKirim, persiapanHari: 2 }], dibuatOleh: admin.id })
    .returning({ id: jadwalToko.id });
  return { id: t.id, versiJadwal: jadwal.id };
}

/** Draft tersimpan langsung (tanpa menghitung) untuk toko-toko `toko`; `tertahan` = satu dari dua barisnya bermasalah. */
async function buatDraftUji(idGudang: number, tanggalKirim: TanggalBisnis, toko: { id: number; versiJadwal: number; tertahan: boolean }[]) {
  const versiRankingId = await publikasikanRankingUji({ keluarga: [], idPengguna: admin.id });
  const [periode] = await db
    .insert(periodeSumberGudang)
    .values({ gudangId: idGudang, bulan: ["2026-06"], ditetapkanOleh: admin.id })
    .returning({ id: periodeSumberGudang.id });
  const kunci = await bacaKunciVersi(db);
  const [draft] = await db
    .insert(draftRencana)
    .values({
      gudangId: idGudang,
      tanggalKirim,
      dihitungOleh: admin.id,
      versiPeriodeSumber: periode.id,
      revisiKalender: kunci.revisiKalender,
      versiRankingId,
      bulanSumber: ["2026-06"],
      imporAktif: kunci.imporAktif,
    })
    .returning({ id: draftRencana.id });
  for (const t of toko) {
    const [tokoDraft] = await db
      .insert(tokoDraftRencana)
      .values({ draftId: draft.id, tokoId: t.id, versiJadwal: t.versiJadwal, persiapanHari: 2, panjangCakupan: 7, cakupan: [], perubahanKategori: [] })
      .returning({ id: tokoDraftRencana.id });
    await db.insert(barisDraftRencana).values(
      [0, 1].map((i) => {
        const bermasalah = t.tertahan && i === 0;
        return {
          tokoDraftId: tokoDraft.id,
          kodeProduk: kodeProdukUji(),
          klasifikasi: "otomatis" as const,
          kebutuhan: 5,
          persenBuffer: 10,
          masalah: bermasalah ? (["stok-belum-diisi"] satisfies MasalahBarisDraft[]) : ([] satisfies MasalahBarisDraft[]),
          stokAkhir: bermasalah ? null : 2,
          jumlahKirim: bermasalah ? null : 4,
        };
      }),
    );
  }
  return { draftId: draft.id, versiRankingId };
}

async function finalkan(idGudang: number, tokoId: number, tanggalKirim: TanggalBisnis, versiRankingId: number) {
  const [baris] = await db
    .insert(rencanaFinal)
    .values({
      gudangId: idGudang,
      namaGudang: "Gudang Uji",
      tokoId,
      namaToko: "Toko Uji",
      tanggalKirim,
      versi: 1,
      difinalisasiOleh: admin.id,
      namaPemfinalisasi: "Uji admin",
      bulanSumber: ["2026-06"],
      versiPeriodeSumber: 1,
      impor: [],
      versiRankingId,
      bulanRanking: "2026-09",
      versiRanking: 1,
      versiJadwal: 1,
      jadwal: { pola: "mingguan", hariKirim: [{ hari: hariKirim, persiapanHari: 2 }], tanggalJangkar: null },
      persiapanHari: 2,
      panjangCakupan: 7,
      revisiKalender: 0,
      perubahanKategori: [],
      cakupan: [],
    })
    .returning({ id: rencanaFinal.id });
  rencanaFinalUji.push(baris.id);
}

describe("Mulai di sini: admin", () => {
  it("belum ada yang dikerjakan → empat langkah Belum, urut sesuai urutan kerja dengan tautan halamannya", async () => {
    // Impor menunggu ditinjau, belum ada ranking berlaku, produk belum dipetakan, usulan jadwal menunggu.
    await db.insert(impor).values({
      namaFile: "penjualan-uji.xlsx",
      ukuranByte: 1,
      kunciObjek: kunciObjekBaru(),
      namaSheet: "JUNI (S)",
      tahunImpor: tahunUji(),
      bulanImpor: 6,
      status: "siap-ditinjau",
      diunggahOleh: admin.id,
    });
    await db
      .update(versiRanking)
      .set({ status: "diarsipkan", diarsipkanPada: new Date() })
      .where(eq(versiRanking.status, "dipublikasikan"));
    await db.insert(produk).values({
      kode: kodeProdukUji(),
      nama: "PRODUK UJI",
      ukuran: "100ML",
      kategori: "PARFUM WANITA",
      klasifikasi: "otomatis",
      statusKeluargaAroma: "belum-dipetakan",
    });
    const toko = await buatTokoUji();
    await db.insert(usulanJadwal).values({
      jenis: "buat",
      pola: "mingguan",
      hariKirim: [{ hari: "Senin", persiapanHari: 0 }],
      diusulkanOleh: admin.id,
      tokoId: toko.id,
    });

    const isi = await muatIsiBeranda(admin, hariIni);
    expect(langkahAdmin(isi)).toEqual([
      ["impor-penjualan", false, "/admin/impor"],
      ["terbitkan-ranking", false, "/admin/ranking"],
      ["periksa-pemetaan", false, "/admin/pemetaan-produk"],
      ["setujui-usulan-jadwal", false, "/admin/jadwal"],
    ]);
  });

  it("impor aktif tanpa impor menunggu ditinjau + ranking berlaku + pemetaan lengkap + tanpa usulan menunggu → semua Selesai", async () => {
    await db
      .update(impor)
      .set({ status: "diarsipkan", diarsipkanPada: new Date() })
      .where(eq(impor.status, "siap-ditinjau"));
    await db.insert(impor).values({
      namaFile: "penjualan-uji.xlsx",
      ukuranByte: 1,
      kunciObjek: kunciObjekBaru(),
      namaSheet: "JUNI (S)",
      tahunImpor: tahunUji(),
      bulanImpor: 6,
      status: "aktif",
      diunggahOleh: admin.id,
      diaktifkanOleh: admin.id,
      diaktifkanPada: new Date(),
    });
    await publikasikanRankingUji({ keluarga: [], idPengguna: admin.id });
    await db.update(produk).set({ statusKeluargaAroma: "tanpa-aroma" }).where(eq(produk.statusKeluargaAroma, "belum-dipetakan"));
    await db
      .update(usulanJadwal)
      .set({ status: "ditolak", diputuskanOleh: admin.id, diputuskanPada: new Date(), alasanPenolakan: "Uji T94" })
      .where(eq(usulanJadwal.status, "menunggu"));

    const isi = await muatIsiBeranda(admin, hariIni);
    expect(langkahAdmin(isi)).toEqual([
      ["impor-penjualan", true, "/admin/impor"],
      ["terbitkan-ranking", true, "/admin/ranking"],
      ["periksa-pemetaan", true, "/admin/pemetaan-produk"],
      ["setujui-usulan-jadwal", true, "/admin/jadwal"],
    ]);
  });

  it("viewer tidak mendapat kartu Mulai di sini", async () => {
    const { id, email } = await buatPenggunaUji("viewer");
    const isi = await muatIsiBeranda({ id, nama: "Uji viewer", email, peran: "viewer" }, hariIni);
    expect(isi.mulaiDiSini).toBeNull();
  });
});

describe("Mulai di sini: operator (per gudang, tanggal kirim terdekat)", () => {
  it("gudang tanpa toko berjadwal: tanpa tanggal kirim terdekat dan tanpa langkah; operator tidak melihat langkah admin", async () => {
    const isi = await muatIsiBeranda(await operatorUji([cibubur]), hariIni);
    expect(isi.mulaiDiSini).toEqual([
      { untuk: "gudang", gudang: { id: cibubur, nama: "Gudang Cibubur" }, tanggalKirim: null, langkah: [] },
    ]);
  });

  it("tanpa draft → tiga langkah Belum, semuanya membuka halaman gudang dengan tanggal kirim terdekat", async () => {
    await tokoBerjadwal(cibubur);
    const isi = await muatIsiBeranda(await operatorUji([cibubur]), hariIni);
    const href = `/pengiriman-gudang/${cibubur}?tanggal=${tanggalKirimTerdekat}`;
    const daftar = daftarGudang(isi, cibubur);
    expect(daftar.tanggalKirim).toBe(tanggalKirimTerdekat);
    expect(daftar.langkah.map((l) => [l.jenis, l.selesai, l.href])).toEqual([
      ["hitung-kebutuhan", false, href],
      ["isi-stok", false, href],
      ["finalisasi", false, href],
    ]);
  });

  it("draft dengan baris tertahan → hitung kebutuhan Selesai; isi stok dan finalisasi Belum", async () => {
    await db.delete(hubunganTokoGudang).where(eq(hubunganTokoGudang.gudangId, cibubur));
    const a = await tokoBerjadwal(cibubur);
    const b = await tokoBerjadwal(cibubur);
    await buatDraftUji(cibubur, tanggalKirimTerdekat, [
      { ...a, tertahan: true },
      { ...b, tertahan: false },
    ]);
    const isi = await muatIsiBeranda(await operatorUji([cibubur]), hariIni);
    expect(daftarGudang(isi, cibubur).langkah.map((l) => [l.jenis, l.selesai])).toEqual([
      ["hitung-kebutuhan", true],
      ["isi-stok", false],
      ["finalisasi", false],
    ]);
  });

  it("draft tanpa baris tertahan dan semua toko yang mengirim tanggal itu final → semua Selesai; gudang kedua punya daftar sendiri", async () => {
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
    await db.delete(hubunganTokoGudang).where(eq(hubunganTokoGudang.gudangId, cibubur));
    const a = await tokoBerjadwal(cibubur);
    const b = await tokoBerjadwal(cibubur);
    const { versiRankingId } = await buatDraftUji(cibubur, tanggalKirimTerdekat, [
      { ...a, tertahan: false },
      { ...b, tertahan: false },
    ]);
    const operator = await operatorUji([cibubur, jabodetabek]);

    // Satu toko belum final → finalisasi Belum.
    await finalkan(cibubur, a.id, tanggalKirimTerdekat, versiRankingId);
    expect(daftarGudang(await muatIsiBeranda(operator, hariIni), cibubur).langkah.map((l) => [l.jenis, l.selesai])).toEqual([
      ["hitung-kebutuhan", true],
      ["isi-stok", true],
      ["finalisasi", false],
    ]);

    await finalkan(cibubur, b.id, tanggalKirimTerdekat, versiRankingId);
    const isi = await muatIsiBeranda(operator, hariIni);
    expect(daftarGudang(isi, cibubur).langkah.map((l) => [l.jenis, l.selesai])).toEqual([
      ["hitung-kebutuhan", true],
      ["isi-stok", true],
      ["finalisasi", true],
    ]);
    expect(isi.mulaiDiSini?.map((d) => (d.untuk === "gudang" ? d.gudang.nama : d.untuk))).toEqual([
      "Gudang Cibubur",
      "Gudang Jabodetabek",
    ]);
    expect(daftarGudang(isi, jabodetabek)).toMatchObject({ tanggalKirim: null, langkah: [] });
  });
});
