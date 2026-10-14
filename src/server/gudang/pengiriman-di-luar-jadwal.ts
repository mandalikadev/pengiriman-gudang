import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  tanggalKirimBerikutnya,
  tanggalKirimMenurutJadwal,
  tanggalKirimToko,
  type Jadwal,
  type PengirimanDiLuarJadwalBerlaku,
} from "@/domain/jadwal";
import { formatTanggal, geserHari, parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import {
  gudang,
  hubunganTokoGudang,
  jadwalToko,
  pengirimanDiLuarJadwal,
  rencanaFinal,
  toko,
  user,
  type JenisPengirimanDiLuarJadwal,
  type StatusPengirimanDiLuarJadwal,
} from "@/server/db/schema";

import { bacaJadwalAktif, bacaJangkar, jadwalTokoGudang, type TokoDenganJadwal, type Tx } from "./jadwal";
import { NAMA_GUDANG_PUSAT } from "./seed-master";

// Pengiriman di luar jadwal (T113, PRD A5 ▶ Revisi 2026-10-13): operator dengan hak `kelola-usulan-jadwal` mengusulkan
// satu pengiriman untuk satu toko pada satu tanggal (tambahan, atau pindah dari satu tanggal rutin) tanpa mengubah
// jadwal tetap. Gudang selain Pusat menunggu persetujuan admin; Pusat langsung berlaku. Syarat diperiksa saat diusulkan
// dan diperiksa ulang saat disetujui, di dalam transaksi setelah baris toko dikunci, sehingga usulan bersamaan untuk toko
// yang sama berjalan bergantian. Kewenangan (peran dan hak) diperiksa pemanggil (server action). `hariIni` = tanggal
// saat ini (WIB), dari pemanggil.

type Persiapan = 0 | 1 | 2;

export type IsianPengirimanDiLuarJadwal = {
  idToko: number;
  jenis: JenisPengirimanDiLuarJadwal;
  tanggalKirim: TanggalBisnis;
  persiapanHari: Persiapan;
  /** Wajib untuk jenis `pindah`, diabaikan untuk `tambahan`. */
  tanggalRutinDipindah: TanggalBisnis | null;
  alasan: string;
};

/** Hasil tindakan; `idGudang` = gudang pengiriman itu, untuk memuat ulang halamannya. */
export type HasilPengirimanDiLuarJadwal = { keadaan: "berhasil"; idGudang: number } | { keadaan: "gagal"; pesan: string };

const AKTIF: StatusPengirimanDiLuarJadwal[] = ["menunggu", "berlaku"];

const gagal = (pesan: string) => ({ keadaan: "gagal", pesan }) as const;
const syarat = (pesan: string) => `Syarat tidak terpenuhi: ${pesan}`;

/** Ada rencana final toko `idToko` untuk tanggal kirim `tanggal` (gudang mana pun). */
function adaRencanaFinal(idToko: SQLWrapper | number, tanggal: SQLWrapper | string) {
  return sql<boolean>`exists (select 1 from ${rencanaFinal} where ${rencanaFinal.tokoId} = ${idToko} and ${rencanaFinal.tanggalKirim} = ${tanggal})`;
}

async function rencanaFinalAda(tx: Tx, idToko: number, tanggal: string) {
  const baris = await tx
    .select({ id: rencanaFinal.id })
    .from(rencanaFinal)
    .where(and(eq(rencanaFinal.tokoId, idToko), eq(rencanaFinal.tanggalKirim, tanggal)))
    .limit(1);
  return baris.length > 0;
}

/** Pengiriman di luar jadwal toko yang menunggu atau berlaku, selain `kecualiId`. */
async function pengirimanAktifToko(tx: Tx, idToko: number, kecualiId: number | null) {
  const baris = await tx
    .select({
      status: pengirimanDiLuarJadwal.status,
      tanggalKirim: pengirimanDiLuarJadwal.tanggalKirim,
      persiapanHari: pengirimanDiLuarJadwal.persiapanHari,
      tanggalRutinDipindah: pengirimanDiLuarJadwal.tanggalRutinDipindah,
    })
    .from(pengirimanDiLuarJadwal)
    .where(
      and(
        eq(pengirimanDiLuarJadwal.tokoId, idToko),
        inArray(pengirimanDiLuarJadwal.status, AKTIF),
        kecualiId === null ? undefined : ne(pengirimanDiLuarJadwal.id, kecualiId),
      ),
    );
  return baris.map((b) => ({
    status: b.status,
    tanggalKirim: parseTanggalBisnis(b.tanggalKirim),
    persiapanHari: b.persiapanHari,
    tanggalRutinDipindah: b.tanggalRutinDipindah === null ? null : parseTanggalBisnis(b.tanggalRutinDipindah),
  }));
}

/** Mengunci baris toko bila terhubung ke gudang `idGudang`; `false` = tidak terhubung. */
async function kunciTokoDiGudang(tx: Tx, idToko: number, idGudang: number) {
  const [terhubung] = await tx
    .select({ id: toko.id })
    .from(hubunganTokoGudang)
    .innerJoin(toko, eq(toko.id, hubunganTokoGudang.tokoId))
    .where(and(eq(hubunganTokoGudang.tokoId, idToko), eq(hubunganTokoGudang.gudangId, idGudang)))
    .for("update", { of: toko });
  return terhubung !== undefined;
}

/**
 * Syarat PRD A5 ▶ Revisi 2026-10-13. `kecualiId` = pengiriman yang sedang disetujui (tidak dibandingkan dengan dirinya
 * sendiri). `null` = semua syarat terpenuhi; selain itu pesan yang menyebut syarat yang gagal.
 */
async function periksaSyarat(
  tx: Tx,
  { idGudang, isian, hariIni, kecualiId }: { idGudang: number; isian: IsianPengirimanDiLuarJadwal; hariIni: TanggalBisnis; kecualiId: number | null },
): Promise<string | null> {
  if (isian.alasan.trim() === "") return "Isi alasan.";
  if (!(await kunciTokoDiGudang(tx, isian.idToko, idGudang))) return syarat("toko tidak terhubung ke gudang ini.");
  const jadwal = await bacaJadwalAktif(tx, isian.idToko);
  if (jadwal === null) return syarat("toko ini tidak punya jadwal tetap aktif.");

  const { tanggalKirim } = isian;
  if (tanggalKirim < hariIni) return syarat(`tanggal kirim ${formatTanggal(tanggalKirim)} sudah lewat. Pilih hari ini atau sesudahnya.`);

  const lain = await pengirimanAktifToko(tx, isian.idToko, kecualiId);
  const berlaku: PengirimanDiLuarJadwalBerlaku[] = lain.filter((p) => p.status === "berlaku");
  if (tanggalKirimToko(jadwal, berlaku, tanggalKirim, tanggalKirim).length > 0) {
    return syarat(`${formatTanggal(tanggalKirim)} sudah menjadi tanggal kirim toko ini.`);
  }
  if (lain.some((p) => p.tanggalKirim === tanggalKirim)) {
    return syarat(`toko ini sudah punya usulan pengiriman di luar jadwal pada ${formatTanggal(tanggalKirim)}.`);
  }

  if (isian.jenis === "pindah") {
    const rutin = isian.tanggalRutinDipindah;
    if (rutin === null) return "Pilih tanggal rutin yang dipindah.";
    const teks = formatTanggal(rutin);
    if (!tanggalKirimMenurutJadwal(jadwal, rutin).kirim) return syarat(`${teks} bukan tanggal kirim rutin toko ini menurut jadwal tetap.`);
    if (rutin < hariIni) return syarat(`tanggal rutin ${teks} sudah lewat.`);
    if (lain.some((p) => p.tanggalRutinDipindah === rutin)) return syarat(`tanggal rutin ${teks} sudah dipindah oleh pengiriman lain.`);
    if (await rencanaFinalAda(tx, isian.idToko, rutin)) return syarat(`tanggal rutin ${teks} sudah punya rencana final untuk toko ini.`);
  }
  return null;
}

async function namaGudang(tx: Tx, idGudang: number) {
  const [baris] = await tx.select({ nama: gudang.nama }).from(gudang).where(eq(gudang.id, idGudang));
  return baris?.nama ?? null;
}

/**
 * Mengusulkan satu pengiriman di luar jadwal di gudang `idGudang`. Gudang Pusat: langsung berlaku tanpa persetujuan;
 * gudang lain: menunggu persetujuan admin. Jadwal tetap tidak berubah.
 */
export async function usulkanPengirimanDiLuarJadwal({
  idGudang,
  isian,
  idPengguna,
  hariIni,
}: {
  idGudang: number;
  isian: IsianPengirimanDiLuarJadwal;
  idPengguna: string;
  hariIni: TanggalBisnis;
}): Promise<HasilPengirimanDiLuarJadwal> {
  return db.transaction(async (tx) => {
    const nama = await namaGudang(tx, idGudang);
    if (nama === null) return gagal("Gudang tidak ditemukan.");
    const pesan = await periksaSyarat(tx, { idGudang, isian, hariIni, kecualiId: null });
    if (pesan !== null) return gagal(pesan);

    await tx.insert(pengirimanDiLuarJadwal).values({
      gudangId: idGudang,
      tokoId: isian.idToko,
      jenis: isian.jenis,
      tanggalKirim: isian.tanggalKirim,
      persiapanHari: isian.persiapanHari,
      tanggalRutinDipindah: isian.jenis === "pindah" ? isian.tanggalRutinDipindah : null,
      alasan: isian.alasan.trim(),
      status: nama === NAMA_GUDANG_PUSAT ? "berlaku" : "menunggu",
      diusulkanOleh: idPengguna,
    });
    return { keadaan: "berhasil", idGudang };
  });
}

const PESAN_TIDAK_DITEMUKAN = "Pengiriman di luar jadwal tidak ditemukan.";
const PESAN_SUDAH_DIPUTUSKAN = "Usulan ini tidak lagi menunggu. Muat ulang halaman untuk melihat statusnya.";

async function kunciPengiriman(tx: Tx, id: number) {
  const [baris] = await tx.select().from(pengirimanDiLuarJadwal).where(eq(pengirimanDiLuarJadwal.id, id)).for("update");
  return baris ?? null;
}

/** Menyetujui usulan menunggu setelah syarat diperiksa ulang; status menjadi berlaku dengan pemutus dan waktunya. */
export async function setujuiPengirimanDiLuarJadwal({
  id,
  idPengguna,
  hariIni,
}: {
  id: number;
  idPengguna: string;
  hariIni: TanggalBisnis;
}): Promise<HasilPengirimanDiLuarJadwal> {
  return db.transaction(async (tx) => {
    const p = await kunciPengiriman(tx, id);
    if (p === null) return gagal(PESAN_TIDAK_DITEMUKAN);
    if (p.status !== "menunggu") return gagal(PESAN_SUDAH_DIPUTUSKAN);

    const isian: IsianPengirimanDiLuarJadwal = {
      idToko: p.tokoId,
      jenis: p.jenis,
      tanggalKirim: parseTanggalBisnis(p.tanggalKirim),
      persiapanHari: p.persiapanHari,
      tanggalRutinDipindah: p.tanggalRutinDipindah === null ? null : parseTanggalBisnis(p.tanggalRutinDipindah),
      alasan: p.alasan,
    };
    const pesan = await periksaSyarat(tx, { idGudang: p.gudangId, isian, hariIni, kecualiId: p.id });
    if (pesan !== null) return gagal(`Usulan tidak bisa disetujui. ${pesan}`);

    await tx
      .update(pengirimanDiLuarJadwal)
      .set({ status: "berlaku", diputuskanOleh: idPengguna, diputuskanPada: sql`now()` })
      .where(eq(pengirimanDiLuarJadwal.id, id));
    return { keadaan: "berhasil", idGudang: p.gudangId };
  });
}

/** Menolak usulan menunggu dengan alasan wajib. */
export async function tolakPengirimanDiLuarJadwal({
  id,
  alasan,
  idPengguna,
}: {
  id: number;
  alasan: string;
  idPengguna: string;
}): Promise<HasilPengirimanDiLuarJadwal> {
  if (alasan.trim() === "") return gagal("Isi alasan penolakan.");
  return db.transaction(async (tx) => {
    const p = await kunciPengiriman(tx, id);
    if (p === null) return gagal(PESAN_TIDAK_DITEMUKAN);
    if (p.status !== "menunggu") return gagal(PESAN_SUDAH_DIPUTUSKAN);

    await tx
      .update(pengirimanDiLuarJadwal)
      .set({ status: "ditolak", alasanPenolakan: alasan.trim(), diputuskanOleh: idPengguna, diputuskanPada: sql`now()` })
      .where(eq(pengirimanDiLuarJadwal.id, id));
    return { keadaan: "berhasil", idGudang: p.gudangId };
  });
}

/** Pengusul menarik usulannya yang masih menunggu di gudang `idGudang`. */
export async function tarikPengirimanDiLuarJadwal({
  id,
  idGudang,
  idPengguna,
}: {
  id: number;
  idGudang: number;
  idPengguna: string;
}): Promise<HasilPengirimanDiLuarJadwal> {
  return db.transaction(async (tx) => {
    const p = await kunciPengiriman(tx, id);
    if (p === null || p.gudangId !== idGudang) return gagal(PESAN_TIDAK_DITEMUKAN);
    if (p.diusulkanOleh !== idPengguna) return gagal("Hanya pengusul yang bisa menarik usulan ini.");
    if (p.status !== "menunggu") return gagal(PESAN_SUDAH_DIPUTUSKAN);

    await tx.update(pengirimanDiLuarJadwal).set({ status: "ditarik", ditarikPada: sql`now()` }).where(eq(pengirimanDiLuarJadwal.id, id));
    return { keadaan: "berhasil", idGudang };
  });
}

/**
 * Membatalkan pengiriman yang berlaku, dengan alasan wajib. Syarat: tanggal kirim belum lewat dan belum ada rencana final
 * toko itu untuk tanggal tersebut. `gudangOperator` diisi bila yang membatalkan operator: hanya pengiriman gudang itu,
 * dan hanya gudang Pusat (admin membatalkan di semua gudang). Membatalkan jenis pindah mengembalikan tanggal rutinnya.
 */
export async function batalkanPengirimanDiLuarJadwal({
  id,
  alasan,
  idPengguna,
  hariIni,
  gudangOperator,
}: {
  id: number;
  alasan: string;
  idPengguna: string;
  hariIni: TanggalBisnis;
  gudangOperator: number | null;
}): Promise<HasilPengirimanDiLuarJadwal> {
  if (alasan.trim() === "") return gagal("Isi alasan pembatalan.");
  return db.transaction(async (tx) => {
    const p = await kunciPengiriman(tx, id);
    if (p === null) return gagal(PESAN_TIDAK_DITEMUKAN);
    if (gudangOperator !== null) {
      if (p.gudangId !== gudangOperator) return gagal(PESAN_TIDAK_DITEMUKAN);
      if ((await namaGudang(tx, p.gudangId)) !== NAMA_GUDANG_PUSAT) {
        return gagal("Pengiriman di luar jadwal gudang ini hanya bisa dibatalkan admin.");
      }
    }
    if (p.status !== "berlaku") return gagal("Hanya pengiriman yang berlaku yang bisa dibatalkan.");
    const teks = formatTanggal(parseTanggalBisnis(p.tanggalKirim));
    if (p.tanggalKirim < hariIni) return gagal(`Tidak bisa dibatalkan: tanggal kirim ${teks} sudah lewat.`);
    if (await rencanaFinalAda(tx, p.tokoId, p.tanggalKirim)) {
      return gagal(`Tidak bisa dibatalkan: toko ini sudah punya rencana final untuk ${teks}.`);
    }

    await tx
      .update(pengirimanDiLuarJadwal)
      .set({ status: "dibatalkan", alasanPembatalan: alasan.trim(), dibatalkanOleh: idPengguna, dibatalkanPada: sql`now()` })
      .where(eq(pengirimanDiLuarJadwal.id, id));
    return { keadaan: "berhasil", idGudang: p.gudangId };
  });
}

// --- Bacaan untuk halaman ---

/** Satu pengiriman di luar jadwal beserta catatan aktivitasnya, siap tampil. */
export type EntriPengirimanDiLuarJadwal = {
  id: number;
  idGudang: number;
  gudang: string;
  /** Status aktif gudang saat ini (riwayat menandai gudang nonaktif). */
  gudangAktif: boolean;
  /** Gudang Pusat: pengiriman langsung berlaku tanpa pemutus. */
  gudangPusat: boolean;
  idToko: number;
  toko: string;
  jenis: JenisPengirimanDiLuarJadwal;
  status: StatusPengirimanDiLuarJadwal;
  tanggalKirim: TanggalBisnis;
  persiapanHari: Persiapan;
  tanggalRutinDipindah: TanggalBisnis | null;
  alasan: string;
  idPengusul: string;
  pengusul: string;
  diusulkanPada: Date;
  /** `null` = belum diputuskan, atau langsung berlaku (Pusat). */
  pemutus: string | null;
  diputuskanPada: Date | null;
  alasanPenolakan: string | null;
  /** `null` pada pengiriman dibatalkan = dibatalkan otomatis oleh sistem. */
  pembatal: string | null;
  dibatalkanPada: Date | null;
  alasanPembatalan: string | null;
  ditarikPada: Date | null;
  /** Sudah ada rencana final toko ini untuk tanggal kirimnya. */
  sudahFinal: boolean;
};

const pengusul = alias(user, "pengusul");
const pemutus = alias(user, "pemutus");
const pembatal = alias(user, "pembatal");

/** Waktu kejadian terakhir pengiriman (diusulkan, diputuskan, ditarik, atau dibatalkan). */
const waktuTerakhir = sql`greatest(${pengirimanDiLuarJadwal.diusulkanPada}, ${pengirimanDiLuarJadwal.diputuskanPada}, ${pengirimanDiLuarJadwal.ditarikPada}, ${pengirimanDiLuarJadwal.dibatalkanPada})`;

async function bacaEntri(syaratBaris: SQL | undefined, urutan: SQL[]): Promise<EntriPengirimanDiLuarJadwal[]> {
  const baris = await db
    .select({
      id: pengirimanDiLuarJadwal.id,
      idGudang: pengirimanDiLuarJadwal.gudangId,
      gudang: gudang.nama,
      gudangAktif: gudang.aktif,
      idToko: pengirimanDiLuarJadwal.tokoId,
      toko: toko.nama,
      jenis: pengirimanDiLuarJadwal.jenis,
      status: pengirimanDiLuarJadwal.status,
      tanggalKirim: pengirimanDiLuarJadwal.tanggalKirim,
      persiapanHari: pengirimanDiLuarJadwal.persiapanHari,
      tanggalRutinDipindah: pengirimanDiLuarJadwal.tanggalRutinDipindah,
      alasan: pengirimanDiLuarJadwal.alasan,
      idPengusul: pengirimanDiLuarJadwal.diusulkanOleh,
      pengusul: pengusul.name,
      diusulkanPada: pengirimanDiLuarJadwal.diusulkanPada,
      pemutus: pemutus.name,
      diputuskanPada: pengirimanDiLuarJadwal.diputuskanPada,
      alasanPenolakan: pengirimanDiLuarJadwal.alasanPenolakan,
      pembatal: pembatal.name,
      dibatalkanPada: pengirimanDiLuarJadwal.dibatalkanPada,
      alasanPembatalan: pengirimanDiLuarJadwal.alasanPembatalan,
      ditarikPada: pengirimanDiLuarJadwal.ditarikPada,
      sudahFinal: adaRencanaFinal(pengirimanDiLuarJadwal.tokoId, pengirimanDiLuarJadwal.tanggalKirim),
    })
    .from(pengirimanDiLuarJadwal)
    .innerJoin(gudang, eq(gudang.id, pengirimanDiLuarJadwal.gudangId))
    .innerJoin(toko, eq(toko.id, pengirimanDiLuarJadwal.tokoId))
    .innerJoin(pengusul, eq(pengusul.id, pengirimanDiLuarJadwal.diusulkanOleh))
    .leftJoin(pemutus, eq(pemutus.id, pengirimanDiLuarJadwal.diputuskanOleh))
    .leftJoin(pembatal, eq(pembatal.id, pengirimanDiLuarJadwal.dibatalkanOleh))
    .where(syaratBaris)
    .orderBy(...urutan);
  return baris.map((b) => ({
    ...b,
    gudangPusat: b.gudang === NAMA_GUDANG_PUSAT,
    tanggalKirim: parseTanggalBisnis(b.tanggalKirim),
    tanggalRutinDipindah: b.tanggalRutinDipindah === null ? null : parseTanggalBisnis(b.tanggalRutinDipindah),
  }));
}

/** Pengiriman berlaku yang masih boleh dibatalkan: tanggal kirim belum lewat dan belum ada rencana final. */
export function bisaDibatalkan(entri: EntriPengirimanDiLuarJadwal, hariIni: TanggalBisnis): boolean {
  return entri.status === "berlaku" && entri.tanggalKirim >= hariIni && !entri.sudahFinal;
}

/** Urutan riwayat "terbaru di atas": waktu diusulkan terbaru dulu. */
const TERBARU_DI_ATAS = [desc(pengirimanDiLuarJadwal.diusulkanPada), desc(pengirimanDiLuarJadwal.id)];

/**
 * Daftar "Perlu tindakan" gudang `idGudang` (T128, PRD A5 ▶ Revisi 2026-10-14): usulan menunggu, ditambah pengiriman
 * berlaku yang masih bisa dibatalkan bila `bolehBatalkan` (jalur langsung, Pusat). Terbaru di atas. Pemeriksaan akses
 * oleh pemanggil.
 */
export async function pengirimanPerluTindakan(idGudang: number, { bolehBatalkan, hariIni }: { bolehBatalkan: boolean; hariIni: TanggalBisnis }) {
  const daftar = await bacaEntri(
    and(eq(pengirimanDiLuarJadwal.gudangId, idGudang), inArray(pengirimanDiLuarJadwal.status, AKTIF)),
    TERBARU_DI_ATAS,
  );
  return daftar.filter((e) => e.status === "menunggu" || (bolehBatalkan && bisaDibatalkan(e, hariIni)));
}

/**
 * Riwayat pengiriman di luar jadwal semua gudang dan semua status, terbaru di atas (T128, halaman Riwayat). Filter
 * opsional: gudang, toko, dan rentang tanggal kirim (inklusif). Riwayat terbuka untuk semua pengguna yang sudah masuk
 * (PRD A7 ▶ Keputusan 2026-10-14); pemeriksaan masuk oleh pemanggil.
 */
export async function daftarRiwayatPengirimanDiLuarJadwal(filter: {
  idGudang?: number;
  tokoId?: number;
  dari?: TanggalBisnis;
  sampai?: TanggalBisnis;
}) {
  return bacaEntri(
    and(
      filter.idGudang === undefined ? undefined : eq(pengirimanDiLuarJadwal.gudangId, filter.idGudang),
      filter.tokoId === undefined ? undefined : eq(pengirimanDiLuarJadwal.tokoId, filter.tokoId),
      filter.dari === undefined ? undefined : gte(pengirimanDiLuarJadwal.tanggalKirim, filter.dari),
      filter.sampai === undefined ? undefined : lte(pengirimanDiLuarJadwal.tanggalKirim, filter.sampai),
    ),
    TERBARU_DI_ATAS,
  );
}

/** Pilihan filter tab "Di luar jadwal": semua gudang (urut id) dan toko yang pernah punya pengiriman di luar jadwal. */
export async function pilihanFilterPengirimanDiLuarJadwal(): Promise<{
  adaPengiriman: boolean;
  gudang: { id: number; nama: string; aktif: boolean }[];
  toko: { id: number; nama: string }[];
}> {
  const daftarGudang = await db.select({ id: gudang.id, nama: gudang.nama, aktif: gudang.aktif }).from(gudang).orderBy(asc(gudang.id));
  const daftarToko = await db
    .selectDistinct({ id: toko.id, nama: toko.nama })
    .from(pengirimanDiLuarJadwal)
    .innerJoin(toko, eq(toko.id, pengirimanDiLuarJadwal.tokoId));
  return {
    adaPengiriman: daftarToko.length > 0,
    gudang: daftarGudang,
    toko: daftarToko.sort((a, b) => a.nama.localeCompare(b.nama, "id") || a.id - b.id),
  };
}

/** Riwayat keputusan semua gudang (semua yang tidak lagi menunggu), kejadian terakhir terbaru dulu. Hanya admin. */
export async function riwayatKeputusanPengirimanDiLuarJadwal() {
  return bacaEntri(ne(pengirimanDiLuarJadwal.status, "menunggu"), [sql`${waktuTerakhir} desc`, desc(pengirimanDiLuarJadwal.id)]);
}

/** Usulan menunggu beserta jadwal tetap toko saat ini sebagai pembanding. */
export type UsulanMenungguPersetujuan = EntriPengirimanDiLuarJadwal & { jadwalTetap: Jadwal | null };

/** Semua usulan menunggu (semua gudang), yang terlama dulu. Hanya admin. */
export async function daftarUsulanMenungguPersetujuan(): Promise<UsulanMenungguPersetujuan[]> {
  const daftar = await bacaEntri(eq(pengirimanDiLuarJadwal.status, "menunggu"), [
    asc(pengirimanDiLuarJadwal.diusulkanPada),
    asc(pengirimanDiLuarJadwal.id),
  ]);
  if (daftar.length === 0) return [];
  const jadwal = await db
    .select({ idToko: jadwalToko.tokoId, pola: jadwalToko.pola, hariKirim: jadwalToko.hariKirim, tanggalJangkar: jadwalToko.tanggalJangkar })
    .from(jadwalToko)
    .where(and(eq(jadwalToko.status, "aktif"), inArray(jadwalToko.tokoId, daftar.map((d) => d.idToko))));
  const perToko = new Map(jadwal.map((j) => [j.idToko, { pola: j.pola, hariKirim: j.hariKirim, tanggalJangkar: bacaJangkar(j.tanggalJangkar) }]));
  return daftar.map((d) => ({ ...d, jadwalTetap: perToko.get(d.idToko) ?? null }));
}

/**
 * Pengiriman di luar jadwal gudang `idGudang` yang akan datang (menunggu atau berlaku, tanggal kirim hari ini atau
 * sesudahnya) per id toko, urut tanggal kirim. Pemeriksaan akses oleh pemanggil.
 */
export async function pengirimanAkanDatangPerToko(idGudang: number, hariIni: TanggalBisnis) {
  const daftar = await bacaEntri(
    and(
      eq(pengirimanDiLuarJadwal.gudangId, idGudang),
      inArray(pengirimanDiLuarJadwal.status, AKTIF),
      gte(pengirimanDiLuarJadwal.tanggalKirim, hariIni),
    ),
    [asc(pengirimanDiLuarJadwal.tanggalKirim), asc(pengirimanDiLuarJadwal.id)],
  );
  const perToko = new Map<number, EntriPengirimanDiLuarJadwal[]>();
  for (const d of daftar) perToko.set(d.idToko, [...(perToko.get(d.idToko) ?? []), d]);
  return perToko;
}

/** Banyaknya tanggal kirim rutin yang ditawarkan sebagai tanggal yang dipindah. */
const JUMLAH_TANGGAL_RUTIN = 8;

/** Pilihan toko di form: toko yang punya jadwal tetap aktif, beserta tanggal kirim rutin yang akan datang. */
export type TokoPilihanPengiriman = {
  id: number;
  nama: string;
  /** Tanggal kirim rutin hari ini atau sesudahnya menurut jadwal tetap, beserta persiapannya. */
  tanggalRutin: { tanggal: TanggalBisnis; persiapanHari: Persiapan }[];
};

/** Toko gudang `idGudang` yang punya jadwal tetap aktif (urut nama), untuk form usulan. */
export async function pilihanTokoPengiriman(idGudang: number, hariIni: TanggalBisnis): Promise<TokoPilihanPengiriman[]> {
  return (await jadwalTokoGudang(idGudang)).flatMap(({ id, nama, jadwal }) => {
    if (jadwal === null) return [];
    const tanggalRutin: TokoPilihanPengiriman["tanggalRutin"] = [];
    let tanggal = geserHari(hariIni, -1);
    while (tanggalRutin.length < JUMLAH_TANGGAL_RUTIN) {
      tanggal = tanggalKirimBerikutnya(jadwal, tanggal);
      const hasil = tanggalKirimMenurutJadwal(jadwal, tanggal);
      if (hasil.kirim) tanggalRutin.push({ tanggal, persiapanHari: hasil.persiapanHari });
    }
    return [{ id, nama, tanggalRutin }];
  });
}

// --- Ikut perhitungan (T114, PRD A5 ▶ Revisi 2026-10-13: Ikut perhitungan seperti pengiriman biasa) ---

/** Pengiriman di luar jadwal yang berlaku beserta id dan jenisnya, untuk domain `tanggalKirimMenurutToko`. */
export type PengirimanBerlaku = PengirimanDiLuarJadwalBerlaku & { id: number; jenis: JenisPengirimanDiLuarJadwal };

/**
 * Toko gudang `idGudang` (urut nama) beserta jadwal tetap aktif dan pengiriman di luar jadwal gudang itu yang berlaku:
 * sumber tanggal kirim toko (CONTEXT "Tanggal kirim toko"). Pemeriksaan akses oleh pemanggil.
 */
export async function jadwalKirimTokoGudang(
  idGudang: number,
  klien: typeof db | Tx = db,
): Promise<(TokoDenganJadwal & { diLuarJadwal: PengirimanBerlaku[] })[]> {
  const daftarToko = await jadwalTokoGudang(idGudang, klien);
  const berlaku =
    daftarToko.length === 0
      ? []
      : await klien
          .select({
            id: pengirimanDiLuarJadwal.id,
            idToko: pengirimanDiLuarJadwal.tokoId,
            jenis: pengirimanDiLuarJadwal.jenis,
            tanggalKirim: pengirimanDiLuarJadwal.tanggalKirim,
            persiapanHari: pengirimanDiLuarJadwal.persiapanHari,
            tanggalRutinDipindah: pengirimanDiLuarJadwal.tanggalRutinDipindah,
          })
          .from(pengirimanDiLuarJadwal)
          .where(
            and(
              eq(pengirimanDiLuarJadwal.gudangId, idGudang),
              eq(pengirimanDiLuarJadwal.status, "berlaku"),
              inArray(
                pengirimanDiLuarJadwal.tokoId,
                daftarToko.map((t) => t.id),
              ),
            ),
          );
  const perToko = new Map<number, PengirimanBerlaku[]>();
  for (const { idToko, ...p } of berlaku) {
    const pengiriman: PengirimanBerlaku = {
      ...p,
      tanggalKirim: parseTanggalBisnis(p.tanggalKirim),
      tanggalRutinDipindah: p.tanggalRutinDipindah === null ? null : parseTanggalBisnis(p.tanggalRutinDipindah),
    };
    perToko.set(idToko, [...(perToko.get(idToko) ?? []), pengiriman]);
  }
  return daftarToko.map((t) => ({ ...t, diLuarJadwal: perToko.get(t.id) ?? [] }));
}

/**
 * Keterangan pengiriman di luar jadwal untuk penanda di draft, rencana final, riwayat, dan ekspor (PRD A5 ▶ Revisi
 * 2026-10-13, Catatan aktivitas): jenis, tanggal rutin yang dipindah, alasan, pengusul, dan penyetuju beserta waktunya.
 * Penyetuju kosong = langsung berlaku di gudang Pusat.
 */
export type KeteranganDiLuarJadwal = {
  id: number;
  jenis: JenisPengirimanDiLuarJadwal;
  tanggalRutinDipindah: TanggalBisnis | null;
  alasan: string;
  pengusul: string;
  diusulkanPada: Date;
  penyetuju: string | null;
  disetujuiPada: Date | null;
};

/** Keterangan pengiriman di luar jadwal `id` per id (yang tidak ada dilewati). */
export async function bacaKeteranganDiLuarJadwal(
  id: readonly number[],
  klien: typeof db | Tx = db,
): Promise<Map<number, KeteranganDiLuarJadwal>> {
  if (id.length === 0) return new Map();
  const baris = await klien
    .select({
      id: pengirimanDiLuarJadwal.id,
      jenis: pengirimanDiLuarJadwal.jenis,
      tanggalRutinDipindah: pengirimanDiLuarJadwal.tanggalRutinDipindah,
      alasan: pengirimanDiLuarJadwal.alasan,
      pengusul: pengusul.name,
      diusulkanPada: pengirimanDiLuarJadwal.diusulkanPada,
      penyetuju: pemutus.name,
      disetujuiPada: pengirimanDiLuarJadwal.diputuskanPada,
    })
    .from(pengirimanDiLuarJadwal)
    .innerJoin(pengusul, eq(pengusul.id, pengirimanDiLuarJadwal.diusulkanOleh))
    .leftJoin(pemutus, eq(pemutus.id, pengirimanDiLuarJadwal.diputuskanOleh))
    .where(inArray(pengirimanDiLuarJadwal.id, [...id]));
  return new Map(
    baris.map((b) => [
      b.id,
      { ...b, tanggalRutinDipindah: b.tanggalRutinDipindah === null ? null : parseTanggalBisnis(b.tanggalRutinDipindah) },
    ]),
  );
}
