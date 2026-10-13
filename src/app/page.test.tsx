import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { tanggalWib } from "@/app/admin/impor/format";
import { formatTanggal, geserHari, namaHari, type NamaHari, type TanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import {
  barisDraftRencana,
  draftRencana,
  hubunganTokoGudang,
  impor,
  jadwalToko,
  pengirimanDiLuarJadwal,
  periodeSumberGudang,
  produk,
  rencanaFinal,
  snapshotLibur,
  tokoDraftRencana,
  versiRanking,
} from "@/server/db/schema";
import type { MasalahBarisDraft } from "@/server/gudang/masalah-draft";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { kunciObjekBaru } from "@/server/impor/impor";
import { kodeProdukUji, tahunUjiBebas } from "@/server/impor/uji-bantu";
import { bacaKunciVersi } from "@/server/laporan/cache";
import { buatSnapshotUji, tahunLiburUji } from "@/server/libur/uji-bantu";
import { publikasikanRankingUji } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
// PRD C1: membuka beranda tidak membaca Excel dan tidak menghitung rata-rata; keduanya dipantau di sini.
const pantau = vi.hoisted(() => ({ bacaExcel: 0, hitung: 0 }));
vi.mock("xlsx", async (asli) => {
  const modul = await asli<typeof import("xlsx")>();
  return {
    ...modul,
    read: (...argumen: Parameters<typeof modul.read>) => {
      pantau.bacaExcel += 1;
      return modul.read(...argumen);
    },
  };
});
vi.mock("@/domain/laporan", async (asli) => {
  const modul = await asli<typeof import("@/domain/laporan")>();
  return {
    ...modul,
    hitungLaporan: (...argumen: Parameters<typeof modul.hitungLaporan>) => {
      pantau.hitung += 1;
      return modul.hitungLaporan(...argumen);
    },
    hitungRingkasan: (...argumen: Parameters<typeof modul.hitungRingkasan>) => {
      pantau.hitung += 1;
      return modul.hitungRingkasan(...argumen);
    },
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import Beranda from "./page";

/** Hari ini (WIB). Tanggal kirim uji dihitung relatif terhadapnya karena kartu operator hanya melihat hari ini dan sesudahnya. */
const hariIni = tanggalWib(new Date());

/** Tanggal pertama yang jatuh pada `hari`, mulai hari ini (termasuk hari ini). */
function hariBerikutnya(hari: NamaHari): TanggalBisnis {
  let t = hariIni;
  while (namaHari(t) !== hari) t = geserHari(t, 1);
  return t;
}

/** Tanggal terakhir yang jatuh pada `hari`, sebelum hari ini. */
function hariSebelumnya(hari: NamaHari): TanggalBisnis {
  let t = geserHari(hariIni, -1);
  while (namaHari(t) !== hari) t = geserHari(t, -1);
  return t;
}

/** Hari kirim terdekat yang mungkin: hari ini (Minggu juga bisa menjadi hari kirim, PRD A5 ▶ Revisi 2026-10-13). */
const tanggalKirimTerdekat = hariIni;

const hariKirim = (t: TanggalBisnis) => namaHari(t);

let idAdmin: string;
/** Gudang penugasan operator uji. */
let cibubur: number;
/** Gudang lain yang tidak ditugaskan ke operator uji. */
let jabodetabek: number;
/** Bulan berjalan `YYYY-MM` (WIB), untuk kartu ranking. */
const bulanBerjalan = tanggalWib(new Date()).slice(0, 7);
/** Impor aktif buatan test: yang terakhir diaktifkan, jadi tampil di status data. */
const sheetAktif = `UJI T79 ${randomUUID().slice(0, 8).toUpperCase()} (S)`;

/**
 * Database test dipakai bersama berkas test lain: tindakan yang mereka tinggalkan (usulan menunggu, snapshot menunggu,
 * produk belum dipetakan, impor gagal) diselesaikan di sini agar jumlah di kartu pasti. Berkas lain membuat datanya
 * sendiri, jadi tidak terpengaruh.
 */
async function bereskanTindakanAdmin() {
  await db
    .update(pengirimanDiLuarJadwal)
    .set({ status: "ditolak", diputuskanOleh: idAdmin, diputuskanPada: new Date(), alasanPenolakan: "Uji T79" })
    .where(eq(pengirimanDiLuarJadwal.status, "menunggu"));
  await db.update(snapshotLibur).set({ status: "diarsipkan" }).where(eq(snapshotLibur.status, "menunggu-persetujuan"));
  await db.update(produk).set({ statusKeluargaAroma: "tanpa-aroma" }).where(eq(produk.statusKeluargaAroma, "belum-dipetakan"));
  await db
    .update(impor)
    .set({ status: "diarsipkan", diarsipkanPada: new Date() })
    .where(inArray(impor.status, ["gagal", "siap-ditinjau"]));
  // Ranking bulan berjalan dianggap belum pernah dipublikasikan sampai test ini mempublikasikannya.
  await db
    .update(versiRanking)
    .set({ dipublikasikanPada: null, dipublikasikanOleh: null })
    .where(eq(versiRanking.bulanRanking, bulanBerjalan));
}

async function buatImporUji(status: "gagal" | "siap-ditinjau" | "diunggah" | "aktif", namaSheet = "JUNI (S)") {
  await db.insert(impor).values({
    namaFile: "penjualan-uji.xlsx",
    ukuranByte: 1,
    kunciObjek: kunciObjekBaru(),
    namaSheet,
    tahunImpor: await tahunUjiBebas(),
    bulanImpor: 6,
    status,
    diunggahOleh: idAdmin,
    diaktifkanOleh: status === "aktif" ? idAdmin : null,
    diaktifkanPada: status === "aktif" ? new Date() : null,
  });
}

async function buatProdukUji(statusKeluargaAroma: "belum-dipetakan" | "tanpa-aroma") {
  await db.insert(produk).values({
    kode: kodeProdukUji(),
    nama: "PRODUK UJI",
    ukuran: "100ML",
    kategori: "PARFUM WANITA",
    klasifikasi: "otomatis",
    statusKeluargaAroma,
  });
}

/**
 * Toko uji terhubung ke `idGudang` dengan jadwal aktif `hari` H−2 (mingguan, atau dua mingguan dengan `tanggalJangkar`);
 * mengembalikan id toko dan versi jadwalnya.
 */
async function tokoBerjadwal(
  idGudang: number,
  hari: NamaHari,
  { aktif = true, tanggalJangkar = null }: { aktif?: boolean; tanggalJangkar?: TanggalBisnis | null } = {},
) {
  const t = await buatTokoUji({ aktif });
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: idGudang });
  const [jadwal] = await db
    .insert(jadwalToko)
    .values({
      tokoId: t.id,
      pola: tanggalJangkar === null ? "mingguan" : "dua-mingguan",
      hariKirim: [{ hari, persiapanHari: 2 }],
      tanggalJangkar,
      dibuatOleh: idAdmin,
    })
    .returning({ id: jadwalToko.id });
  return { id: t.id, versiJadwal: jadwal.id };
}

/** Id rencana final buatan test, dihapus di akhir agar tidak terbaca berkas test lain. */
const rencanaFinalUji: number[] = [];

/** Rencana final versi 1 untuk toko–tanggal kirim, ditulis langsung (tanpa finalisasi; isi snapshot seadanya). */
async function buatRencanaFinalUji(idGudang: number, tokoId: number, tanggalKirim: TanggalBisnis, versiRankingId: number) {
  const [baris] = await db
    .insert(rencanaFinal)
    .values({
      gudangId: idGudang,
      namaGudang: "Gudang Uji",
      tokoId,
      namaToko: "Toko Uji",
      tanggalKirim,
      versi: 1,
      difinalisasiOleh: idAdmin,
      namaPemfinalisasi: "Uji admin",
      bulanSumber: ["2026-06"],
      versiPeriodeSumber: 1,
      impor: [],
      versiRankingId,
      bulanRanking: bulanBerjalan,
      versiRanking: 1,
      versiJadwal: 1,
      jadwal: { pola: "mingguan", hariKirim: [{ hari: hariKirim(tanggalKirim), persiapanHari: 2 }], tanggalJangkar: null },
      persiapanHari: 2,
      panjangCakupan: 7,
      revisiKalender: 0,
      perubahanKategori: [],
      cakupan: [],
    })
    .returning({ id: rencanaFinal.id });
  rencanaFinalUji.push(baris.id);
}

/**
 * Draft tersimpan langsung di database (tanpa menghitung). `mutakhir` = dasar perhitungannya sama dengan yang berlaku
 * (periode sumber, impor aktif, ranking, jadwal, kalender, pemetaan) sehingga tidak perlu dihitung ulang; `false` =
 * impor aktif yang dipakai tidak tercatat, yang oleh `periksaHitungUlang` dianggap berubah (T61).
 * `hari` = hari kirim jadwal toko-tokonya (harus sesuai `tanggalKirim`); `toko` = jumlah baris tertahan per toko (0–2).
 */
async function buatDraftUji({
  idGudang,
  tanggalKirim,
  hari,
  versiRankingId,
  mutakhir,
  toko,
  tokoAktif = true,
}: {
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  hari: NamaHari;
  versiRankingId: number;
  mutakhir: boolean;
  toko: { jumlahTertahan: 0 | 1 | 2 }[];
  /** `false` = toko-tokonya dinonaktifkan, agar jadwalnya tidak ikut menentukan tanggal kirim terdekat gudang. */
  tokoAktif?: boolean;
}) {
  const [periode] = await db
    .insert(periodeSumberGudang)
    .values({ gudangId: idGudang, bulan: ["2026-06"], ditetapkanOleh: idAdmin })
    .returning({ id: periodeSumberGudang.id });
  const kunci = await bacaKunciVersi(db);
  const [draft] = await db
    .insert(draftRencana)
    .values({
      gudangId: idGudang,
      tanggalKirim,
      dihitungOleh: idAdmin,
      versiPeriodeSumber: periode.id,
      revisiKalender: kunci.revisiKalender,
      versiRankingId,
      bulanSumber: ["2026-06"],
      imporAktif: mutakhir ? kunci.imporAktif : null,
    })
    .returning({ id: draftRencana.id });
  for (const { jumlahTertahan } of toko) {
    const t = await tokoBerjadwal(idGudang, hari, { aktif: tokoAktif });
    const [tokoDraft] = await db
      .insert(tokoDraftRencana)
      .values({ draftId: draft.id, tokoId: t.id, versiJadwal: t.versiJadwal, persiapanHari: 2, panjangCakupan: 7, cakupan: [], perubahanKategori: [] })
      .returning({ id: tokoDraftRencana.id });
    // Dua baris per toko: `jumlahTertahan` di antaranya tertahan (stok belum diisi). Semua tanpa master produk, jadi
    // dianggap belum dipetakan, sama seperti yang tercatat saat dihitung.
    await db.insert(barisDraftRencana).values(
      [0, 1].map((i) => ({
        tokoDraftId: tokoDraft.id,
        kodeProduk: kodeProdukUji(),
        klasifikasi: "otomatis" as const,
        kebutuhan: 5,
        persenBuffer: 10,
        masalah: i < jumlahTertahan ? (["stok-belum-diisi"] satisfies MasalahBarisDraft[]) : ([] satisfies MasalahBarisDraft[]),
        stokAkhir: i < jumlahTertahan ? null : 2,
        jumlahKirim: i < jumlahTertahan ? null : 4,
        statusKeluargaAroma: "belum-dipetakan" as const,
      })),
    );
  }
}

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  cibubur = await idGudangUji("Gudang Cibubur");
  jabodetabek = await idGudangUji("Gudang Jabodetabek");
  // Dua gudang uji dimulai tanpa draft dan tanpa toko terhubung dari berkas test lain.
  await db.delete(draftRencana).where(inArray(draftRencana.gudangId, [cibubur, jabodetabek]));
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.gudangId, [cibubur, jabodetabek]));
  await bereskanTindakanAdmin();
  await buatImporUji("aktif", sheetAktif);
});

afterAll(async () => {
  if (rencanaFinalUji.length > 0) await db.delete(rencanaFinal).where(inArray(rencanaFinal.id, rencanaFinalUji));
  // Draft dan toko uji dilepas agar berkas test lain (mis. periode sumber Gudang Jabodetabek) tidak terhalang FK (T75).
  await db.delete(draftRencana).where(inArray(draftRencana.gudangId, [cibubur, jabodetabek]));
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.gudangId, [cibubur, jabodetabek]));
});

beforeEach(() => {
  kepala.cookie = "";
  pantau.bacaExcel = 0;
  pantau.hitung = 0;
});

async function buka() {
  const html = renderToStaticMarkup(await Beranda());
  // PRD C1: beranda hanya membaca yang tersimpan.
  expect(pantau.bacaExcel).toBe(0);
  expect(pantau.hitung).toBe(0);
  return html;
}

/** Kartu Perlu tindakan: jenis → { jumlah, href, keterangan }. */
function kartu(html: string) {
  const hasil: Record<string, { jumlah: number; href: string; teks: string }> = {};
  for (const m of html.matchAll(/<a ([^>]*data-kartu="([^"]+)"[^>]*)>(.*?)<\/a>/g)) {
    const atribut = m[1]!;
    hasil[m[2]!] = {
      jumlah: Number(/data-jumlah="(\d+)"/.exec(atribut)?.[1]),
      href: /href="([^"]+)"/.exec(atribut)?.[1] ?? "",
      teks: m[3]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    };
  }
  return hasil;
}

/** Pintasan: [href, label]. */
function pintasan(html: string) {
  const nav = /<nav aria-label="Pintasan"[^>]*>(.*?)<\/nav>/.exec(html)?.[1] ?? "";
  return [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => [m[1], m[2]!.replace(/<[^>]+>/g, "").trim()]);
}

/** Bagian "Mulai di sini" (T94), atau "" bila tidak tampil. */
const bagianMulai = (html: string) => /<section [^>]*data-mulai-di-sini[^>]*>(.*?)<\/section>/.exec(html)?.[1] ?? "";

/** Langkah "Mulai di sini" dalam urutan tampil: [nomor, jenis, status, href tombol, teks]. */
function langkahMulai(html: string) {
  return [...bagianMulai(html).matchAll(/<li [^>]*data-langkah="([^"]+)"[^>]*>(.*?)<\/li>/g)].map((m) => {
    const isi = m[2]!;
    return {
      nomor: /data-nomor-langkah[^>]*>(\d+)</.exec(isi)?.[1],
      jenis: m[1],
      status: /data-status-langkah="([^"]+)"/.exec(isi)?.[1],
      href: /<a [^>]*href="([^"]+)"/.exec(isi)?.[1]?.replaceAll("&amp;", "&"),
      teks: isi.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    };
  });
}

const statusData = (html: string) => /<p[^>]*data-status-data[^>]*>(.*?)<\/p>/.exec(html)?.[1] ?? "";

describe("/ (beranda)", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(Beranda()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer: sapaan, status data, dan pintasan Ringkasan/Kalender saja", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    const html = await buka();

    expect(html).toContain("Selamat datang, Uji viewer");
    expect(html).toContain('data-peran="viewer"');
    expect(html).toContain(">Viewer<");
    expect(html).not.toContain("Perlu tindakan");
    expect(html).not.toContain("Semua beres");
    // Viewer tidak mendapat kartu Mulai di sini (T94).
    expect(html).not.toContain("Mulai di sini");
    expect(bagianMulai(html)).toBe("");
    expect(kartu(html)).toEqual({});

    // Status data: impor aktif terakhir dan status cache laporan (T33), satu baris.
    expect(statusData(html)).toContain("Impor aktif terakhir");
    expect(statusData(html)).toContain(sheetAktif);
    expect(html).toContain("Hasil hitung laporan");
    expect(html).toMatch(/data-status-cache="[a-z-]+"/);

    expect(pintasan(html)).toEqual([
      ["/ringkasan", "Ringkasan"],
      ["/kalender", "Kalender"],
    ]);

    // Zona suasana (DESIGN §1): judul Fraunces besar, blob latar maksimal 2, jarak lega.
    expect(html).toContain("text-4xl font-bold");
    expect(html).toContain("md:text-5xl");
    expect(html.match(/blur-3xl/g)?.length ?? 0).toBeLessThanOrEqual(2);
    expect(html).toContain("py-16");
    expect(html).toContain("hover:scale-105");
  });

  it("admin tanpa tindakan: keadaan kosong Semua beres (ikon + teks) dan pintasan Impor/Ringkasan/Gudang", async () => {
    await publikasikanRankingUji({ keluarga: [], idPengguna: idAdmin, bulanRanking: bulanBerjalan });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await buka();

    expect(html).toContain("Selamat datang, Uji admin");
    expect(html).toContain('data-peran="admin"');
    expect(html).toContain("Perlu tindakan");
    expect(kartu(html)).toEqual({});
    const kosong = /<p[^>]*data-semua-beres[^>]*>(.*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(kosong).toContain("Semua beres");
    expect(kosong).toContain("lucide-circle-check");
    expect(kosong).toContain("text-success");

    // Mulai di sini (T94): impor aktif tanpa yang menunggu ditinjau, ranking berlaku, pemetaan lengkap, tanpa usulan
    // menunggu → "Semua langkah beres" tanpa daftar, di atas Perlu tindakan.
    const mulai = bagianMulai(html);
    expect(mulai).toContain("Mulai di sini");
    expect(langkahMulai(html)).toEqual([]);
    const beres = /<p[^>]*data-semua-langkah-beres[^>]*>(.*?)<\/p>/.exec(mulai)?.[1] ?? "";
    expect(beres).toContain("Semua langkah beres");
    expect(beres).toContain("lucide-circle-check");
    expect(beres).toContain("text-success");
    expect(html.indexOf("Mulai di sini")).toBeLessThan(html.indexOf("Perlu tindakan"));

    expect(pintasan(html)).toEqual([
      ["/admin/impor", "Impor"],
      ["/ringkasan", "Ringkasan"],
      ["/admin/gudang", "Gudang"],
    ]);
  });

  it("admin melihat kartu dengan jumlah yang benar per jenis tindakan; kartu berjumlah 0 tidak tampil", async () => {
    // Ranking bulan berjalan: belum dipublikasikan.
    await db
      .update(versiRanking)
      .set({ dipublikasikanPada: null, dipublikasikanOleh: null })
      .where(eq(versiRanking.bulanRanking, bulanBerjalan));
    // 2 usulan pengiriman di luar jadwal menunggu (yang ditolak tidak dihitung; T113).
    const [tokoA, tokoB, tokoC] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
    const usulan = {
      gudangId: await idGudangUji("Gudang Bali"),
      jenis: "tambahan" as const,
      tanggalKirim: "2099-01-06",
      persiapanHari: 1 as const,
      alasan: "Uji",
      diusulkanOleh: idAdmin,
    };
    await db.insert(pengirimanDiLuarJadwal).values([
      { ...usulan, tokoId: tokoA.id },
      { ...usulan, tokoId: tokoB.id },
      { ...usulan, tokoId: tokoC.id, status: "ditolak", diputuskanOleh: idAdmin, diputuskanPada: new Date(), alasanPenolakan: "Uji" },
    ]);
    // 1 snapshot libur menunggu (yang aktif tidak dihitung).
    await buatSnapshotUji(await tahunLiburUji(), idAdmin, "menunggu-persetujuan", []);
    await buatSnapshotUji(await tahunLiburUji(), idAdmin, "aktif", []);
    // 3 produk belum dipetakan (tanpa aroma tidak dihitung).
    await buatProdukUji("belum-dipetakan");
    await buatProdukUji("belum-dipetakan");
    await buatProdukUji("belum-dipetakan");
    await buatProdukUji("tanpa-aroma");
    // 2 impor: 1 gagal + 1 siap ditinjau (yang masih diproses dan yang aktif tidak dihitung).
    await buatImporUji("gagal");
    await buatImporUji("siap-ditinjau");
    await buatImporUji("diunggah");

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const sebelum = kartu(await buka());
    expect(sebelum).toEqual({
      "usulan-jadwal": { jumlah: 2, href: "/admin/jadwal", teks: expect.stringContaining("Usulan pengiriman di luar jadwal menunggu persetujuan") },
      "snapshot-libur": { jumlah: 1, href: "/admin/libur", teks: expect.stringContaining("Snapshot libur menunggu ditinjau") },
      "produk-belum-dipetakan": {
        jumlah: 3,
        href: "/admin/pemetaan-produk?status=belum-dipetakan",
        teks: expect.stringContaining("Produk belum dipetakan"),
      },
      "ranking-bulan-berjalan": {
        jumlah: 1,
        href: "/admin/ranking",
        teks: expect.stringContaining("Ranking bulan berjalan belum dipublikasikan"),
      },
      "impor-gagal-atau-menunggu": { jumlah: 2, href: "/admin/impor", teks: expect.stringContaining("Impor gagal atau menunggu diaktifkan") },
    });
    // Urutan kartu sesuai issue T79.
    expect(Object.keys(sebelum)).toEqual([
      "usulan-jadwal",
      "snapshot-libur",
      "produk-belum-dipetakan",
      "ranking-bulan-berjalan",
      "impor-gagal-atau-menunggu",
    ]);

    // Mulai di sini (T94): empat langkah admin bernomor sesuai urutan kerja. Ranking berlaku (dipublikasikan di test
    // sebelumnya) sudah ada; impor menunggu ditinjau, produk belum dipetakan, dan usulan menunggu membuat langkah lain Belum.
    const langkah = langkahMulai(await buka());
    expect(langkah.map(({ nomor, jenis, status, href }) => [nomor, jenis, status, href])).toEqual([
      ["1", "impor-penjualan", "belum", "/admin/impor"],
      ["2", "terbitkan-ranking", "selesai", "/admin/ranking"],
      ["3", "periksa-pemetaan", "belum", "/admin/pemetaan-produk"],
      ["4", "setujui-usulan-jadwal", "belum", "/admin/jadwal"],
    ]);
    expect(langkah.map((l) => l.teks)).toEqual([
      expect.stringMatching(/^1 Impor penjualan .+ Belum Buka Impor$/),
      expect.stringMatching(/^2 Terbitkan ranking pusat .+ Selesai Buka Ranking$/),
      expect.stringMatching(/^3 Periksa pemetaan produk .+ Belum Buka Pemetaan produk$/),
      expect.stringMatching(/^4 Setujui pengiriman di luar jadwal .+ Belum Buka Persetujuan jadwal$/),
    ]);

    // Ranking bulan berjalan dipublikasikan → kartunya hilang; kartu lain tetap.
    await publikasikanRankingUji({ keluarga: [], idPengguna: idAdmin, bulanRanking: bulanBerjalan });
    const sesudah = kartu(await buka());
    expect(sesudah["ranking-bulan-berjalan"]).toBeUndefined();
    expect(Object.keys(sesudah)).toEqual(["usulan-jadwal", "snapshot-libur", "produk-belum-dipetakan", "impor-gagal-atau-menunggu"]);
  });

  it("operator tanpa tindakan di gudangnya: Semua beres", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: [] });
    kepala.cookie = operator.cookie;
    const html = await buka();

    expect(html).toContain('data-peran="operator"');
    expect(html).toContain("Gudang Cibubur");
    expect(kartu(html)).toEqual({});
    expect(html).toContain("Semua beres");
    // Mulai di sini (T94): gudang tanpa toko berjadwal → keterangan singkat tanpa langkah.
    expect(bagianMulai(html)).toContain("Gudang Cibubur");
    expect(bagianMulai(html)).toContain("Belum ada toko aktif berjadwal");
    expect(langkahMulai(html)).toEqual([]);
  });

  it("operator hanya melihat kartu gudang penugasannya; data gudang lain dan draft tanggal kirim yang lewat tidak dihitung", async () => {
    const versiRankingId = await publikasikanRankingUji({ keluarga: [], idPengguna: idAdmin, bulanRanking: bulanBerjalan });
    const rabu = hariBerikutnya("Rabu");
    const senin = hariBerikutnya("Senin");
    // Gudang penugasan: satu draft perlu dihitung ulang (tanpa baris tertahan), dan (di bawah) satu draft mutakhir dengan
    // satu toko yang punya 2 baris tertahan dan satu toko tanpa masalah.
    await buatDraftUji({ idGudang: cibubur, tanggalKirim: rabu, hari: "Rabu", versiRankingId, mutakhir: false, toko: [{ jumlahTertahan: 0 }] });
    // Draft gudang penugasan yang tanggal kirimnya sudah lewat: perlu dihitung ulang dan punya toko tertahan, tetapi
    // tidak dihitung (DESIGN §9 ▶ Keputusan T79: hanya tanggal kirim hari ini dan sesudahnya).
    await buatDraftUji({
      idGudang: cibubur,
      tanggalKirim: hariSebelumnya("Jumat"),
      hari: "Jumat",
      versiRankingId,
      mutakhir: false,
      toko: [{ jumlahTertahan: 1 }],
      tokoAktif: false,
    });
    // Dibuat terakhir untuk gudang ini: setiap draft uji menetapkan periode sumber baru.
    await buatDraftUji({
      idGudang: cibubur,
      tanggalKirim: senin,
      hari: "Senin",
      versiRankingId,
      mutakhir: true,
      toko: [{ jumlahTertahan: 2 }, { jumlahTertahan: 0 }],
    });
    // Gudang lain: draft perlu dihitung ulang dengan dua toko tertahan; tidak boleh dihitung.
    await buatDraftUji({
      idGudang: jabodetabek,
      tanggalKirim: senin,
      hari: "Senin",
      versiRankingId,
      mutakhir: false,
      toko: [{ jumlahTertahan: 1 }, { jumlahTertahan: 1 }],
    });

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["hitung-kebutuhan"] });
    kepala.cookie = operator.cookie;
    const html = await buka();

    expect(html).toContain("Selamat datang, Uji viewer");
    expect(html).toContain('data-peran="operator"');
    expect(html).toContain(">Operator");
    expect(html).toContain("Gudang Cibubur");
    expect(html).not.toContain("Gudang Jabodetabek");

    // Tanggal kirim terdekat gudang = Rabu atau Senin terdekat; belum ada toko yang difinalisasi untuk tanggal itu.
    const terdekat = rabu < senin ? rabu : senin;
    expect(kartu(html)).toEqual({
      "draft-perlu-dihitung-ulang": {
        jumlah: 1,
        href: `/pengiriman-gudang/${cibubur}`,
        teks: expect.stringContaining("Draft perlu dihitung ulang"),
      },
      "toko-baris-tertahan": {
        jumlah: 1,
        href: `/pengiriman-gudang/${cibubur}`,
        teks: expect.stringContaining("Toko dengan baris tertahan"),
      },
      "toko-belum-final": {
        jumlah: terdekat === rabu ? 1 : 2,
        href: `/pengiriman-gudang/${cibubur}?tanggal=${terdekat}`,
        teks: expect.stringContaining("Toko belum difinalisasi untuk tanggal kirim terdekat"),
      },
    });
    expect(Object.values(kartu(html)).every((k) => k.teks.includes("Gudang Cibubur"))).toBe(true);
    // Kartu admin tidak tampil untuk operator; tanpa Semua beres karena ada kartu.
    expect(html).not.toContain("Usulan pengiriman di luar jadwal menunggu persetujuan");
    expect(html).not.toContain("Semua beres");

    expect(pintasan(html)).toEqual([
      ["/pengiriman-gudang", "Pengiriman Gudang"],
      ["/ringkasan", "Ringkasan"],
      ["/kalender", "Kalender"],
    ]);
  });

  it("operator: toko aktif yang mengirim pada tanggal kirim terdekat gudangnya dan belum final dihitung, walaupun draft belum dihitung", async () => {
    // Gudang penugasan dimulai tanpa toko dan draft dari test sebelumnya.
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
    await db.delete(hubunganTokoGudang).where(eq(hubunganTokoGudang.gudangId, cibubur));
    const versiRankingId = await publikasikanRankingUji({ keluarga: [], idPengguna: idAdmin, bulanRanking: bulanBerjalan });
    const t = tanggalKirimTerdekat;
    const hari = hariKirim(t);
    const besok = geserHari(t, 1);

    // Mengirim pada tanggal kirim terdekat: A (sudah final), B (final hanya untuk tanggal lain), C (belum final).
    const tokoA = await tokoBerjadwal(cibubur, hari);
    const tokoB = await tokoBerjadwal(cibubur, hari);
    const tokoC = await tokoBerjadwal(cibubur, hari);
    await buatRencanaFinalUji(cibubur, tokoA.id, t, versiRankingId);
    await buatRencanaFinalUji(cibubur, tokoB.id, geserHari(t, -7), versiRankingId);
    // Tidak dihitung: toko nonaktif berjadwal pada hari itu, toko dua mingguan di pekan lain, toko yang mengirim sesudah
    // tanggal itu, dan toko gudang lain yang belum final.
    await tokoBerjadwal(cibubur, hari, { aktif: false });
    await tokoBerjadwal(cibubur, hari, { tanggalJangkar: geserHari(t, 7) });
    await tokoBerjadwal(cibubur, hariKirim(besok));
    await tokoBerjadwal(jabodetabek, hari);

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: [] });
    kepala.cookie = operator.cookie;
    const sebelum = kartu(await buka());
    expect(sebelum).toEqual({
      "toko-belum-final": {
        jumlah: 2,
        href: `/pengiriman-gudang/${cibubur}?tanggal=${t}`,
        teks: expect.stringContaining("Toko belum difinalisasi untuk tanggal kirim terdekat"),
      },
    });
    expect(sebelum["toko-belum-final"]!.teks).toContain("Gudang Cibubur");
    expect(sebelum["toko-belum-final"]!.teks).toContain(formatTanggal(t));

    // Semua toko yang mengirim pada tanggal itu sudah final → kartu hilang, Semua beres.
    await buatRencanaFinalUji(cibubur, tokoB.id, t, versiRankingId);
    await buatRencanaFinalUji(cibubur, tokoC.id, t, versiRankingId);
    const sesudah = await buka();
    expect(kartu(sesudah)).toEqual({});
    expect(sesudah).toContain("Semua beres");
  });

  it("operator dengan dua gudang: Mulai di sini berisi satu daftar per gudang, langkah membuka halaman gudang dengan tanggal kirim terdekat", async () => {
    await db.delete(draftRencana).where(inArray(draftRencana.gudangId, [cibubur, jabodetabek]));
    await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.gudangId, [cibubur, jabodetabek]));
    const t = tanggalKirimTerdekat;
    await tokoBerjadwal(cibubur, hariKirim(t));

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: [] });
    await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: [] });
    kepala.cookie = operator.cookie;
    const html = await buka();

    const mulai = bagianMulai(html);
    expect(mulai).toContain("Mulai di sini");
    expect(html.indexOf("Mulai di sini")).toBeLessThan(html.indexOf("Perlu tindakan"));
    // Daftar Gudang Cibubur (tanggal kirim terdekat) lalu Gudang Jabodetabek (tanpa toko berjadwal).
    expect(mulai.indexOf("Gudang Cibubur")).toBeLessThan(mulai.indexOf("Gudang Jabodetabek"));
    expect(mulai).toContain(formatTanggal(t));
    expect(mulai).toContain("Belum ada toko aktif berjadwal");

    const href = `/pengiriman-gudang/${cibubur}?tanggal=${t}`;
    const langkah = langkahMulai(html);
    expect(langkah.map(({ nomor, jenis, status, href: h }) => [nomor, jenis, status, h])).toEqual([
      ["1", "hitung-kebutuhan", "belum", href],
      ["2", "isi-stok", "belum", href],
      ["3", "finalisasi", "belum", href],
    ]);
    expect(langkah.map((l) => l.teks)).toEqual([
      expect.stringMatching(/^1 Hitung kebutuhan .+ Belum Buka Pengiriman Gudang$/),
      expect.stringMatching(/^2 Isi stok dan bereskan masalah .*unggah file stok atau ketik.* Belum Buka Pengiriman Gudang$/),
      expect.stringMatching(/^3 Finalisasi .+ Belum Buka Pengiriman Gudang$/),
    ]);
  });
});
