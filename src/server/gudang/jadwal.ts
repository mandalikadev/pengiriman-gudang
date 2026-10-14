import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { periksaJadwal, tanggalKirimMenurutJadwal, type Jadwal, type MasukanJadwal } from "@/domain/jadwal";
import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, jadwalToko, pengirimanDiLuarJadwal, rencanaFinal, toko, user } from "@/server/db/schema";

import { daftarHariKirim } from "./pilihan-jadwal";

// Jadwal tetap toko (T55; T112, PRD A5 ▶ Revisi 2026-10-13): setiap toko paling banyak satu jadwal tetap aktif, diatur
// admin dan langsung berlaku. Alur usulan jadwal tetap oleh operator dan jalur langsung Pusat dihapus (T113).
// Kewenangan diperiksa pemanggil (server action).

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

export const bacaJangkar = (tanggal: string | null) => (tanggal === null ? null : parseTanggalBisnis(tanggal));

/** Toko yang terhubung ke gudang `idGudang` (urut nama) beserta jadwal aktifnya. Pemeriksaan akses oleh pemanggil. */
export async function jadwalTokoGudang(idGudang: number, klien: typeof db | Tx = db): Promise<TokoDenganJadwal[]> {
  const baris = await klien
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

const PESAN_TOKO_TIDAK_TERHUBUNG = "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Memastikan gudang ada dan toko terhubung ke gudang itu, lalu mengunci baris toko agar perubahan jadwal bersamaan untuk
 * toko yang sama berjalan bergantian. `null` = boleh lanjut.
 */
export async function periksaTujuan(tx: Tx, { idGudang, idToko }: { idGudang: number; idToko: number }): Promise<string | null> {
  const [tujuan] = await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang));
  if (!tujuan) return "Gudang tidak ditemukan.";

  const [terhubung] = await tx
    .select({ idToko: toko.id })
    .from(hubunganTokoGudang)
    .innerJoin(toko, eq(toko.id, hubunganTokoGudang.tokoId))
    .where(and(eq(hubunganTokoGudang.tokoId, idToko), eq(hubunganTokoGudang.gudangId, idGudang)))
    .for("update", { of: toko });
  return terhubung ? null : PESAN_TOKO_TIDAK_TERHUBUNG;
}

/** Hari kirim dalam urutan Senin–Minggu, supaya jadwal yang sama selalu tersimpan dengan bentuk yang sama. */
function urutkanHari(hariKirim: Jadwal["hariKirim"]): Jadwal["hariKirim"] {
  return [...hariKirim].sort((a, b) => daftarHariKirim.indexOf(a.hari) - daftarHariKirim.indexOf(b.hari));
}

/** Memvalidasi isian dengan `periksaJadwal` (T54); jadwal yang valid dikembalikan dengan hari kirim terurut. */
export function jadwalDariMasukan(masukan: MasukanJadwal): { jadwal: Jadwal } | { pesan: string } {
  const hasil = periksaJadwal(masukan);
  if (hasil.keadaan === "tidakValid") return { pesan: hasil.pesan.join(" ") };
  return { jadwal: { ...hasil.jadwal, hariKirim: urutkanHari(hasil.jadwal.hariKirim) } };
}

function jadwalSama(a: Jadwal, b: Jadwal) {
  return a.pola === b.pola && a.tanggalJangkar === b.tanggalJangkar && JSON.stringify(a.hariKirim) === JSON.stringify(b.hariKirim);
}

/** Jadwal aktif satu toko di dalam transaksi, atau `null`. */
export async function bacaJadwalAktif(tx: Tx, idToko: number): Promise<(Jadwal & { id: number }) | null> {
  const [aktif] = await tx
    .select({ id: jadwalToko.id, pola: jadwalToko.pola, hariKirim: jadwalToko.hariKirim, tanggalJangkar: jadwalToko.tanggalJangkar })
    .from(jadwalToko)
    .where(and(eq(jadwalToko.tokoId, idToko), eq(jadwalToko.status, "aktif")));
  return aktif ? { ...aktif, tanggalJangkar: bacaJangkar(aktif.tanggalJangkar) } : null;
}

/**
 * Menjadikan `baru` jadwal aktif toko. Jadwal aktif lama
 * dinonaktifkan atas nama `idPengguna` dan tetap tersimpan sebagai riwayat. Jadwal yang sama dengan jadwal aktif tidak
 * membuat versi baru. Harus dipanggil di dalam transaksi setelah `periksaTujuan` mengunci toko.
 */
export async function gantiJadwalAktif(tx: Tx, { idToko, baru, idPengguna }: { idToko: number; baru: Jadwal; idPengguna: string }) {
  const lama = await bacaJadwalAktif(tx, idToko);
  if (lama) {
    if (jadwalSama(lama, baru)) return;
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
}

/** Menonaktifkan jadwal aktif toko atas nama `idPengguna`. `false` = toko tidak punya jadwal aktif. */
export async function nonaktifkanJadwalAktif(tx: Tx, { idToko, idPengguna }: { idToko: number; idPengguna: string }) {
  const baris = await tx
    .update(jadwalToko)
    .set({ status: "nonaktif", dinonaktifkanOleh: idPengguna, dinonaktifkanPada: sql`now()` })
    .where(and(eq(jadwalToko.tokoId, idToko), eq(jadwalToko.status, "aktif")))
    .returning({ id: jadwalToko.id });
  return baris.length > 0;
}

const PESAN_TANPA_JADWAL_AKTIF = "Toko ini tidak punya jadwal aktif. Muat ulang halaman untuk melihat jadwal terbaru.";

const ALASAN_JADWAL_DINONAKTIFKAN = "Jadwal tetap dinonaktifkan";
const ALASAN_JADWAL_BERUBAH = "Jadwal tetap berubah";
const ALASAN_SUDAH_RUTIN = "Tanggal itu sudah menjadi tanggal kirim rutin";

/**
 * Pengiriman di luar jadwal yang terkena pembatalan otomatis oleh sistem (PRD A5 ▶ Revisi 2026-10-13): menunggu atau
 * berlaku, tanggal kirimnya belum lewat (`hariIni` atau sesudahnya), dan belum punya rencana final toko itu untuk tanggal
 * tersebut.
 */
export function bisaDibatalkanOtomatis(hariIni: TanggalBisnis) {
  return and(
    inArray(pengirimanDiLuarJadwal.status, ["menunggu", "berlaku"]),
    gte(pengirimanDiLuarJadwal.tanggalKirim, hariIni),
    sql`not exists (select 1 from ${rencanaFinal} where ${rencanaFinal.tokoId} = ${pengirimanDiLuarJadwal.tokoId} and ${rencanaFinal.tanggalKirim} = ${pengirimanDiLuarJadwal.tanggalKirim})`,
  );
}

/**
 * Pembatalan otomatis oleh sistem (T113, PRD A5 ▶ Revisi 2026-10-13) untuk pengiriman di luar jadwal toko yang
 * `bisaDibatalkanOtomatis`. Setelah jadwal tetap toko diubah (`jadwal` = jadwal tetap baru), hanya yang tidak lagi sesuai
 * yang dibatalkan, dengan alasannya masing-masing. Dengan `alasan` (jadwal tetap dinonaktifkan, atau toko dilepas dari
 * gudang, T115), semuanya dibatalkan dengan alasan itu. Pembatal kosong = sistem. Dipanggil di dalam transaksi
 * perubahannya, setelah baris toko dikunci.
 */
export async function batalkanPengirimanDiLuarJadwalTerdampak(
  tx: Tx,
  { idToko, hariIni, ...perubahan }: { idToko: number; hariIni: TanggalBisnis } & ({ jadwal: Jadwal } | { alasan: string }),
) {
  const terdampak = await tx
    .select({
      id: pengirimanDiLuarJadwal.id,
      tanggalKirim: pengirimanDiLuarJadwal.tanggalKirim,
      tanggalRutinDipindah: pengirimanDiLuarJadwal.tanggalRutinDipindah,
    })
    .from(pengirimanDiLuarJadwal)
    .where(and(eq(pengirimanDiLuarJadwal.tokoId, idToko), bisaDibatalkanOtomatis(hariIni)));

  const alasanUntuk = (p: (typeof terdampak)[number]): string | null => {
    if ("alasan" in perubahan) return perubahan.alasan;
    const rutin = (tanggal: string) => tanggalKirimMenurutJadwal(perubahan.jadwal, parseTanggalBisnis(tanggal)).kirim;
    if (p.tanggalRutinDipindah !== null && !rutin(p.tanggalRutinDipindah)) return ALASAN_JADWAL_BERUBAH;
    if (rutin(p.tanggalKirim)) return ALASAN_SUDAH_RUTIN;
    return null;
  };
  for (const p of terdampak) {
    const alasan = alasanUntuk(p);
    if (alasan === null) continue;
    await tx
      .update(pengirimanDiLuarJadwal)
      .set({ status: "dibatalkan", alasanPembatalan: alasan, dibatalkanPada: sql`now()` })
      .where(eq(pengirimanDiLuarJadwal.id, p.id));
  }
}

// Jadwal tetap diatur admin (T112, PRD A5 ▶ Revisi 2026-10-13): admin membuat, mengubah, dan menonaktifkan jadwal tetap
// toko di semua gudang termasuk Pusat, langsung berlaku tanpa usulan. Versi jadwal berganti sehingga draft terdampak
// tetap ditandai. Pengiriman di luar jadwal toko itu yang tidak lagi sesuai dibatalkan otomatis dalam transaksi yang sama
// (T113). Peran admin diperiksa pemanggil (server action). `hariIni` = tanggal saat ini (WIB).

/** Menyimpan jadwal tetap satu toko atas nama admin `idPengguna`. Toko harus terhubung ke gudang `idGudang`. */
export async function aturJadwalTetap({
  idGudang,
  idToko,
  masukan,
  idPengguna,
  hariIni,
}: {
  idGudang: number;
  idToko: number;
  masukan: MasukanJadwal;
  idPengguna: string;
  hariIni: TanggalBisnis;
}): Promise<HasilJadwal> {
  const hasil = jadwalDariMasukan(masukan);

  return db.transaction(async (tx) => {
    const pesanTujuan = await periksaTujuan(tx, { idGudang, idToko });
    if (pesanTujuan !== null) return { keadaan: "gagal", pesan: pesanTujuan };
    if ("pesan" in hasil) return { keadaan: "gagal", pesan: hasil.pesan };

    await gantiJadwalAktif(tx, { idToko, baru: hasil.jadwal, idPengguna });
    await batalkanPengirimanDiLuarJadwalTerdampak(tx, { idToko, jadwal: hasil.jadwal, hariIni });
    return { keadaan: "berhasil" };
  });
}

/** Menonaktifkan jadwal tetap satu toko atas nama admin `idPengguna`. Riwayat tidak dihapus. */
export async function nonaktifkanJadwalTetap({
  idGudang,
  idToko,
  idPengguna,
  hariIni,
}: {
  idGudang: number;
  idToko: number;
  idPengguna: string;
  hariIni: TanggalBisnis;
}): Promise<HasilJadwal> {
  return db.transaction(async (tx) => {
    const pesanTujuan = await periksaTujuan(tx, { idGudang, idToko });
    if (pesanTujuan !== null) return { keadaan: "gagal", pesan: pesanTujuan };

    if (!(await nonaktifkanJadwalAktif(tx, { idToko, idPengguna }))) {
      return { keadaan: "gagal", pesan: PESAN_TANPA_JADWAL_AKTIF };
    }
    await batalkanPengirimanDiLuarJadwalTerdampak(tx, { idToko, alasan: ALASAN_JADWAL_DINONAKTIFKAN, hariIni });
    return { keadaan: "berhasil" };
  });
}

/** Satu baris riwayat jadwal tetap toko. `berakhir` null = masih aktif. */
export type EntriRiwayatJadwal = Jadwal & {
  id: number;
  diaturOleh: string;
  diaturPada: Date;
  berakhir: { jenis: "diganti" | "dinonaktifkan"; oleh: string; pada: Date } | null;
};

/**
 * Riwayat jadwal tetap setiap toko yang terhubung ke gudang `idGudang`: semua baris `jadwal_toko`, terbaru di atas.
 * Jadwal yang diganti dan penggantinya ditulis dalam satu transaksi (`gantiJadwalAktif`), jadi waktu nonaktifnya sama
 * dengan waktu dibuat jadwal berikutnya; selain itu jadwal itu dinonaktifkan. Pemeriksaan akses oleh pemanggil.
 */
export async function riwayatJadwalTetapGudang(idGudang: number): Promise<Map<number, EntriRiwayatJadwal[]>> {
  const pengatur = alias(user, "pengatur");
  const penonaktif = alias(user, "penonaktif");
  const baris = await db
    .select({
      id: jadwalToko.id,
      idToko: jadwalToko.tokoId,
      pola: jadwalToko.pola,
      hariKirim: jadwalToko.hariKirim,
      tanggalJangkar: jadwalToko.tanggalJangkar,
      diaturOleh: pengatur.name,
      diaturPada: jadwalToko.dibuatPada,
      dinonaktifkanOleh: penonaktif.name,
      dinonaktifkanPada: jadwalToko.dinonaktifkanPada,
    })
    .from(hubunganTokoGudang)
    .innerJoin(jadwalToko, eq(jadwalToko.tokoId, hubunganTokoGudang.tokoId))
    .innerJoin(pengatur, eq(pengatur.id, jadwalToko.dibuatOleh))
    .leftJoin(penonaktif, eq(penonaktif.id, jadwalToko.dinonaktifkanOleh))
    .where(eq(hubunganTokoGudang.gudangId, idGudang))
    .orderBy(asc(jadwalToko.tokoId), desc(jadwalToko.id));

  const riwayat = new Map<number, EntriRiwayatJadwal[]>();
  for (const b of baris) {
    const daftar = riwayat.get(b.idToko) ?? [];
    // Baris sebelumnya di daftar (terbaru di atas) adalah jadwal berikutnya toko ini.
    const berikutnya = daftar.at(-1);
    const berakhir =
      b.dinonaktifkanPada === null
        ? null
        : {
            jenis:
              berikutnya !== undefined && berikutnya.diaturPada.getTime() === b.dinonaktifkanPada.getTime()
                ? ("diganti" as const)
                : ("dinonaktifkan" as const),
            oleh: b.dinonaktifkanOleh ?? "—",
            pada: b.dinonaktifkanPada,
          };
    daftar.push({
      id: b.id,
      pola: b.pola,
      hariKirim: b.hariKirim,
      tanggalJangkar: bacaJangkar(b.tanggalJangkar),
      diaturOleh: b.diaturOleh,
      diaturPada: b.diaturPada,
      berakhir,
    });
    riwayat.set(b.idToko, daftar);
  }
  return riwayat;
}
