import { and, asc, eq, sql } from "drizzle-orm";

import { periksaJadwal, type Jadwal, type MasukanJadwal } from "@/domain/jadwal";
import { parseTanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, jadwalToko, toko, user } from "@/server/db/schema";

import { daftarHariKirim } from "./pilihan-jadwal";
import { NAMA_GUDANG_PUSAT } from "./seed-master";

// Jadwal toko (T55, PRD A5 ▶ OD-06): setiap toko paling banyak satu jadwal aktif. Jadwal toko gudang Pusat diatur
// langsung oleh operator Pusat yang berhak; gudang lain belum bisa mengubah jadwal di sini (usulan + persetujuan
// menyusul, T56). Kewenangan (hak `kelola-usulan-jadwal`) diperiksa pemanggil (server action) sebelum fungsi ini.

/** Jadwal aktif satu toko, siap tampil. */
type JadwalAktif = Jadwal & {
  /**
   * Versi jadwal toko = id jadwal aktif. Berubah setiap kali jadwal toko dibuat atau diubah; toko tanpa jadwal aktif
   * (belum dibuat atau dinonaktifkan) tidak punya versi. Hasil yang menyimpan versi ini bisa dibandingkan dengan versi
   * saat ini untuk tahu apakah jadwalnya sudah berubah (sinyal untuk T61).
   */
  versi: number;
  diaturOleh: string;
  diaturPada: Date;
};

export type TokoDenganJadwal = { id: number; nama: string; aktif: boolean; jadwal: JadwalAktif | null };

const bacaJangkar = (tanggal: string | null) => (tanggal === null ? null : parseTanggalBisnis(tanggal));

/** Toko yang terhubung ke gudang `idGudang` (urut nama) beserta jadwal aktifnya. Pemeriksaan akses oleh pemanggil. */
export async function jadwalTokoGudang(idGudang: number): Promise<TokoDenganJadwal[]> {
  const baris = await db
    .select({
      id: toko.id,
      nama: toko.nama,
      aktif: toko.aktif,
      versi: jadwalToko.id,
      pola: jadwalToko.pola,
      hariKirim: jadwalToko.hariKirim,
      tanggalJangkar: jadwalToko.tanggalJangkar,
      diaturOleh: user.name,
      diaturPada: jadwalToko.dibuatPada,
    })
    .from(hubunganTokoGudang)
    .innerJoin(toko, eq(toko.id, hubunganTokoGudang.tokoId))
    .leftJoin(jadwalToko, and(eq(jadwalToko.tokoId, toko.id), eq(jadwalToko.status, "aktif")))
    .leftJoin(user, eq(user.id, jadwalToko.dibuatOleh))
    .where(eq(hubunganTokoGudang.gudangId, idGudang))
    .orderBy(asc(toko.nama));

  return baris.map((b) => ({
    id: b.id,
    nama: b.nama,
    aktif: b.aktif,
    jadwal:
      b.versi === null || b.pola === null || b.hariKirim === null || b.diaturOleh === null || b.diaturPada === null
        ? null
        : {
            versi: b.versi,
            pola: b.pola,
            hariKirim: b.hariKirim,
            tanggalJangkar: bacaJangkar(b.tanggalJangkar),
            diaturOleh: b.diaturOleh,
            diaturPada: b.diaturPada,
          },
  }));
}

export type HasilJadwal = { keadaan: "berhasil" } | { keadaan: "gagal"; pesan: string };

const PESAN_BUKAN_PUSAT = "Jadwal gudang ini belum bisa diubah langsung. Hanya jadwal gudang Pusat yang bisa diatur di sini.";
const PESAN_TOKO_TIDAK_TERHUBUNG = "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Memastikan gudang adalah Pusat dan toko terhubung ke gudang itu, lalu mengunci baris toko agar perubahan jadwal
 * bersamaan untuk toko yang sama berjalan bergantian. `null` = boleh lanjut.
 */
async function periksaTujuan(tx: Tx, idGudang: number, idToko: number): Promise<string | null> {
  const [tujuan] = await tx.select({ nama: gudang.nama }).from(gudang).where(eq(gudang.id, idGudang));
  if (!tujuan) return "Gudang tidak ditemukan.";
  if (tujuan.nama !== NAMA_GUDANG_PUSAT) return PESAN_BUKAN_PUSAT;

  const [terhubung] = await tx
    .select({ idToko: toko.id })
    .from(hubunganTokoGudang)
    .innerJoin(toko, eq(toko.id, hubunganTokoGudang.tokoId))
    .where(and(eq(hubunganTokoGudang.tokoId, idToko), eq(hubunganTokoGudang.gudangId, idGudang)))
    .for("update", { of: toko });
  return terhubung ? null : PESAN_TOKO_TIDAK_TERHUBUNG;
}

/** Hari kirim dalam urutan Senin–Sabtu, supaya jadwal yang sama selalu tersimpan dengan bentuk yang sama. */
function urutkanHari(hariKirim: Jadwal["hariKirim"]): Jadwal["hariKirim"] {
  return [...hariKirim].sort((a, b) => daftarHariKirim.indexOf(a.hari) - daftarHariKirim.indexOf(b.hari));
}

function jadwalSama(a: Jadwal, b: Jadwal) {
  return a.pola === b.pola && a.tanggalJangkar === b.tanggalJangkar && JSON.stringify(a.hariKirim) === JSON.stringify(b.hariKirim);
}

/**
 * Menyimpan jadwal toko gudang Pusat (PRD A5 ▶ OD-06). Isian divalidasi `periksaJadwal` (T54). Bila toko sudah punya
 * jadwal aktif, jadwal lama dinonaktifkan dan jadwal baru disisipkan dalam satu transaksi; jadwal lama tetap tersimpan
 * sebagai riwayat. Jadwal yang sama dengan jadwal aktif tidak membuat versi baru.
 */
export async function simpanJadwalToko({
  idGudang,
  idToko,
  masukan,
  idPengguna,
}: {
  idGudang: number;
  idToko: number;
  masukan: MasukanJadwal;
  idPengguna: string;
}): Promise<HasilJadwal> {
  const hasil = periksaJadwal(masukan);

  return db.transaction(async (tx) => {
    const pesanTujuan = await periksaTujuan(tx, idGudang, idToko);
    if (pesanTujuan !== null) return { keadaan: "gagal", pesan: pesanTujuan };
    if (hasil.keadaan === "tidakValid") return { keadaan: "gagal", pesan: hasil.pesan.join(" ") };
    const baru: Jadwal = { ...hasil.jadwal, hariKirim: urutkanHari(hasil.jadwal.hariKirim) };

    const [lama] = await tx
      .select({ id: jadwalToko.id, pola: jadwalToko.pola, hariKirim: jadwalToko.hariKirim, tanggalJangkar: jadwalToko.tanggalJangkar })
      .from(jadwalToko)
      .where(and(eq(jadwalToko.tokoId, idToko), eq(jadwalToko.status, "aktif")));
    if (lama) {
      if (jadwalSama({ ...lama, tanggalJangkar: bacaJangkar(lama.tanggalJangkar) }, baru)) {
        return { keadaan: "berhasil" };
      }
      await tx
        .update(jadwalToko)
        .set({ status: "nonaktif", dinonaktifkanOleh: idPengguna, dinonaktifkanPada: sql`now()` })
        .where(eq(jadwalToko.id, lama.id));
    }
    await tx.insert(jadwalToko).values({
      tokoId: idToko,
      pola: baru.pola,
      hariKirim: [...baru.hariKirim],
      tanggalJangkar: baru.tanggalJangkar,
      dibuatOleh: idPengguna,
    });
    return { keadaan: "berhasil" };
  });
}

/** Menonaktifkan jadwal aktif toko gudang Pusat (PRD A5 ▶ OD-06), mencatat siapa dan kapan. Riwayat tidak dihapus. */
export async function nonaktifkanJadwalToko({
  idGudang,
  idToko,
  idPengguna,
}: {
  idGudang: number;
  idToko: number;
  idPengguna: string;
}): Promise<HasilJadwal> {
  return db.transaction(async (tx) => {
    const pesanTujuan = await periksaTujuan(tx, idGudang, idToko);
    if (pesanTujuan !== null) return { keadaan: "gagal", pesan: pesanTujuan };

    const baris = await tx
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idPengguna, dinonaktifkanPada: sql`now()` })
      .where(and(eq(jadwalToko.tokoId, idToko), eq(jadwalToko.status, "aktif")))
      .returning({ id: jadwalToko.id });
    if (baris.length === 0) {
      return { keadaan: "gagal", pesan: "Toko ini tidak punya jadwal aktif. Muat ulang halaman untuk melihat jadwal terbaru." };
    }
    return { keadaan: "berhasil" };
  });
}
