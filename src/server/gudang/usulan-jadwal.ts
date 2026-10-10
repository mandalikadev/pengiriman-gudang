import { aliasedTable, and, asc, desc, eq, sql } from "drizzle-orm";

import type { Jadwal, MasukanJadwal } from "@/domain/jadwal";
import { db } from "@/server/db";
import {
  gudang,
  hubunganTokoGudang,
  jadwalToko,
  toko,
  usulanJadwal,
  user,
  type JenisUsulanJadwal,
  type StatusUsulanJadwal,
} from "@/server/db/schema";

import {
  bacaJadwalAktif,
  bacaJangkar,
  gantiJadwalAktif,
  jadwalDariMasukan,
  jadwalSama,
  nonaktifkanJadwalAktif,
  periksaTujuan,
  PESAN_TANPA_JADWAL_AKTIF,
  type HasilJadwal,
  type Tx,
} from "./jadwal";
import { NAMA_GUDANG_PUSAT } from "./seed-master";

// Usulan jadwal gudang selain Pusat (T56, PRD A5 ▶ OD-06 dan ▶ Keputusan perencanaan M2–M3): operator dengan hak
// `kelola-usulan-jadwal` mengusulkan buat/ubah/nonaktifkan; admin menyetujui atau menolak. Usulan menunggu tidak
// mengubah jadwal aktif. Persetujuan mengganti jadwal aktif lewat aturan penggantian yang sama dengan pengaturan
// langsung Pusat (`gantiJadwalAktif`/`nonaktifkanJadwalAktif`), dalam satu transaksi; versi jadwal toko (id jadwal
// aktif) ikut berganti sebagai sinyal perubahan jadwal (T61). Kewenangan diperiksa pemanggil (server action).

const GAGAL_SUDAH_ADA_USULAN = {
  keadaan: "gagal",
  pesan: "Toko ini masih punya usulan jadwal yang menunggu persetujuan admin.",
  sebab: "usulanMenunggu",
} as const satisfies HasilJadwal;

/** Usulan dengan status `menunggu` untuk toko ini sudah ada (dicek dalam transaksi setelah toko dikunci). */
async function adaUsulanMenunggu(tx: Tx, idToko: number) {
  const [ada] = await tx
    .select({ id: usulanJadwal.id })
    .from(usulanJadwal)
    .where(and(eq(usulanJadwal.tokoId, idToko), eq(usulanJadwal.status, "menunggu")));
  return ada !== undefined;
}

/**
 * Mengusulkan jadwal baru (jenis `buat`) atau perubahan jadwal (jenis `ubah`) untuk toko gudang selain Pusat. Jenis
 * ditentukan dari ada tidaknya jadwal aktif saat usulan dibuat. Isian divalidasi `periksaJadwal` (T54).
 */
export async function usulkanJadwalToko({
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
  const hasil = jadwalDariMasukan(masukan);

  return db.transaction(async (tx) => {
    const pesanTujuan = await periksaTujuan(tx, { idGudang, idToko, jalur: "usulan" });
    if (pesanTujuan !== null) return { keadaan: "gagal", pesan: pesanTujuan };
    if ("pesan" in hasil) return { keadaan: "gagal", pesan: hasil.pesan };
    if (await adaUsulanMenunggu(tx, idToko)) return GAGAL_SUDAH_ADA_USULAN;

    const aktif = await bacaJadwalAktif(tx, idToko);
    if (aktif && jadwalSama(aktif, hasil.jadwal)) {
      return { keadaan: "gagal", pesan: "Usulan sama dengan jadwal aktif. Ubah dulu pola, hari kirim, atau tanggal jangkar." };
    }
    await tx.insert(usulanJadwal).values({
      tokoId: idToko,
      jenis: aktif ? "ubah" : "buat",
      pola: hasil.jadwal.pola,
      hariKirim: [...hasil.jadwal.hariKirim],
      tanggalJangkar: hasil.jadwal.tanggalJangkar,
      diusulkanOleh: idPengguna,
    });
    return { keadaan: "berhasil" };
  });
}

/** Mengusulkan penonaktifan jadwal aktif toko gudang selain Pusat. */
export async function usulkanNonaktifJadwalToko({
  idGudang,
  idToko,
  idPengguna,
}: {
  idGudang: number;
  idToko: number;
  idPengguna: string;
}): Promise<HasilJadwal> {
  return db.transaction(async (tx) => {
    const pesanTujuan = await periksaTujuan(tx, { idGudang, idToko, jalur: "usulan" });
    if (pesanTujuan !== null) return { keadaan: "gagal", pesan: pesanTujuan };
    if (await adaUsulanMenunggu(tx, idToko)) return GAGAL_SUDAH_ADA_USULAN;
    if (!(await bacaJadwalAktif(tx, idToko))) return { keadaan: "gagal", pesan: PESAN_TANPA_JADWAL_AKTIF };

    await tx.insert(usulanJadwal).values({ tokoId: idToko, jenis: "nonaktifkan", diusulkanOleh: idPengguna });
    return { keadaan: "berhasil" };
  });
}

/** Status usulan terakhir satu toko, untuk halaman Pengiriman Gudang. */
export type UsulanTerakhir = {
  jenis: JenisUsulanJadwal;
  status: StatusUsulanJadwal;
  diusulkanOleh: string;
  diusulkanPada: Date;
  alasanPenolakan: string | null;
};

const pengusul = aliasedTable(user, "pengusul");

/** Usulan terakhir setiap toko yang terhubung ke gudang `idGudang`, per id toko. Pemeriksaan akses oleh pemanggil. */
export async function usulanTerakhirPerToko(idGudang: number): Promise<Map<number, UsulanTerakhir>> {
  const baris = await db
    .selectDistinctOn([usulanJadwal.tokoId], {
      idToko: usulanJadwal.tokoId,
      jenis: usulanJadwal.jenis,
      status: usulanJadwal.status,
      diusulkanOleh: pengusul.name,
      diusulkanPada: usulanJadwal.diusulkanPada,
      alasanPenolakan: usulanJadwal.alasanPenolakan,
    })
    .from(usulanJadwal)
    .innerJoin(hubunganTokoGudang, eq(hubunganTokoGudang.tokoId, usulanJadwal.tokoId))
    .innerJoin(pengusul, eq(pengusul.id, usulanJadwal.diusulkanOleh))
    .where(eq(hubunganTokoGudang.gudangId, idGudang))
    .orderBy(usulanJadwal.tokoId, desc(usulanJadwal.id));
  return new Map(baris.map(({ idToko, ...usulan }) => [idToko, usulan]));
}

/** Satu usulan menunggu beserta jadwal aktif toko saat ini, untuk halaman admin "Persetujuan jadwal". */
export type UsulanMenunggu = {
  id: number;
  jenis: JenisUsulanJadwal;
  toko: string;
  /** `null` = toko tidak lagi terhubung ke gudang mana pun. */
  gudang: string | null;
  /** Isi usulan; `null` untuk usulan `nonaktifkan`. */
  usulan: Jadwal | null;
  /** Jadwal aktif toko saat ini (pembanding rincian beda). */
  jadwalAktif: Jadwal | null;
  diusulkanOleh: string;
  diusulkanPada: Date;
};

/** Semua usulan berstatus `menunggu`, yang terlama dulu. Pemeriksaan peran admin oleh pemanggil. */
export async function daftarUsulanMenunggu(): Promise<UsulanMenunggu[]> {
  const baris = await db
    .select({
      id: usulanJadwal.id,
      jenis: usulanJadwal.jenis,
      toko: toko.nama,
      gudang: gudang.nama,
      pola: usulanJadwal.pola,
      hariKirim: usulanJadwal.hariKirim,
      tanggalJangkar: usulanJadwal.tanggalJangkar,
      aktifPola: jadwalToko.pola,
      aktifHariKirim: jadwalToko.hariKirim,
      aktifTanggalJangkar: jadwalToko.tanggalJangkar,
      diusulkanOleh: pengusul.name,
      diusulkanPada: usulanJadwal.diusulkanPada,
    })
    .from(usulanJadwal)
    .innerJoin(toko, eq(toko.id, usulanJadwal.tokoId))
    .innerJoin(pengusul, eq(pengusul.id, usulanJadwal.diusulkanOleh))
    .leftJoin(hubunganTokoGudang, eq(hubunganTokoGudang.tokoId, usulanJadwal.tokoId))
    .leftJoin(gudang, eq(gudang.id, hubunganTokoGudang.gudangId))
    .leftJoin(jadwalToko, and(eq(jadwalToko.tokoId, usulanJadwal.tokoId), eq(jadwalToko.status, "aktif")))
    .where(eq(usulanJadwal.status, "menunggu"))
    .orderBy(asc(usulanJadwal.diusulkanPada), asc(usulanJadwal.id));

  return baris.map((b) => ({
    id: b.id,
    jenis: b.jenis,
    toko: b.toko,
    gudang: b.gudang,
    usulan:
      b.pola === null || b.hariKirim === null
        ? null
        : { pola: b.pola, hariKirim: b.hariKirim, tanggalJangkar: bacaJangkar(b.tanggalJangkar) },
    jadwalAktif:
      b.aktifPola === null || b.aktifHariKirim === null
        ? null
        : { pola: b.aktifPola, hariKirim: b.aktifHariKirim, tanggalJangkar: bacaJangkar(b.aktifTanggalJangkar) },
    diusulkanOleh: b.diusulkanOleh,
    diusulkanPada: b.diusulkanPada,
  }));
}

/** Hasil keputusan admin; `idGudang` = gudang toko saat ini (untuk memuat ulang halaman Pengiriman Gudangnya). */
export type HasilKeputusanUsulan = { keadaan: "berhasil"; idGudang: number | null } | { keadaan: "gagal"; pesan: string };

const PESAN_USULAN_TIDAK_DITEMUKAN = "Usulan jadwal tidak ditemukan.";
const PESAN_SUDAH_DIPUTUSKAN = "Usulan ini sudah diputuskan. Muat ulang halaman untuk melihat usulan terbaru.";

/** Mengunci usulan yang masih menunggu, atau pesan mengapa tidak bisa diputuskan. */
async function kunciUsulanMenunggu(
  tx: Tx,
  idUsulan: number,
): Promise<{ usulan: typeof usulanJadwal.$inferSelect } | { pesan: string }> {
  const [usulan] = await tx.select().from(usulanJadwal).where(eq(usulanJadwal.id, idUsulan)).for("update");
  if (!usulan) return { pesan: PESAN_USULAN_TIDAK_DITEMUKAN };
  if (usulan.status !== "menunggu") return { pesan: PESAN_SUDAH_DIPUTUSKAN };
  return { usulan };
}

/** Gudang toko saat ini (dan kunci baris toko), atau `null` jika toko tidak terhubung. */
async function gudangToko(tx: Tx, idToko: number) {
  const [baris] = await tx
    .select({ id: gudang.id, nama: gudang.nama })
    .from(hubunganTokoGudang)
    .innerJoin(gudang, eq(gudang.id, hubunganTokoGudang.gudangId))
    .innerJoin(toko, eq(toko.id, hubunganTokoGudang.tokoId))
    .where(eq(hubunganTokoGudang.tokoId, idToko))
    .for("update", { of: toko });
  return baris ?? null;
}

/**
 * Menyetujui usulan dalam satu transaksi: jadwal aktif toko berganti sesuai usulan (atau dinonaktifkan) atas nama
 * admin penyetuju, lalu usulan ditandai `disetujui` beserta penyetuju dan waktunya.
 */
export async function setujuiUsulanJadwal({ idUsulan, idPengguna }: { idUsulan: number; idPengguna: string }): Promise<HasilKeputusanUsulan> {
  return db.transaction(async (tx) => {
    const terkunci = await kunciUsulanMenunggu(tx, idUsulan);
    if ("pesan" in terkunci) return { keadaan: "gagal", pesan: terkunci.pesan };
    const { usulan } = terkunci;

    const tujuan = await gudangToko(tx, usulan.tokoId);
    if (!tujuan || tujuan.nama === NAMA_GUDANG_PUSAT) {
      return {
        keadaan: "gagal",
        pesan: "Toko ini tidak lagi terhubung ke gudang yang jadwalnya memerlukan persetujuan. Usulan tidak bisa disetujui.",
      };
    }

    const aktif = await bacaJadwalAktif(tx, usulan.tokoId);
    if ((usulan.jenis === "buat") !== (aktif === null)) {
      return {
        keadaan: "gagal",
        pesan: "Jadwal aktif toko sudah berubah sejak usulan dibuat, sehingga jenis usulan tidak lagi sesuai. Usulan tidak bisa disetujui.",
      };
    }

    if (usulan.pola === null || usulan.hariKirim === null) {
      await nonaktifkanJadwalAktif(tx, { idToko: usulan.tokoId, idPengguna });
    } else {
      const baru: Jadwal = { pola: usulan.pola, hariKirim: usulan.hariKirim, tanggalJangkar: bacaJangkar(usulan.tanggalJangkar) };
      await gantiJadwalAktif(tx, { idToko: usulan.tokoId, baru, idPengguna });
    }
    await tx
      .update(usulanJadwal)
      .set({ status: "disetujui", diputuskanOleh: idPengguna, diputuskanPada: sql`now()` })
      .where(eq(usulanJadwal.id, idUsulan));
    return { keadaan: "berhasil", idGudang: tujuan.id };
  });
}

/** Menolak usulan dengan alasan; jadwal aktif tidak berubah. */
export async function tolakUsulanJadwal({
  idUsulan,
  alasan,
  idPengguna,
}: {
  idUsulan: number;
  alasan: string;
  idPengguna: string;
}): Promise<HasilKeputusanUsulan> {
  return db.transaction(async (tx) => {
    const terkunci = await kunciUsulanMenunggu(tx, idUsulan);
    if ("pesan" in terkunci) return { keadaan: "gagal", pesan: terkunci.pesan };

    await tx
      .update(usulanJadwal)
      .set({ status: "ditolak", alasanPenolakan: alasan, diputuskanOleh: idPengguna, diputuskanPada: sql`now()` })
      .where(eq(usulanJadwal.id, idUsulan));
    const tujuan = await gudangToko(tx, terkunci.usulan.tokoId);
    return { keadaan: "berhasil", idGudang: tujuan?.id ?? null };
  });
}
