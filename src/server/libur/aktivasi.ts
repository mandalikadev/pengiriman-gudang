import { createHash } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { bandingkanDaftarLibur, type JenisLibur, type PerubahanLibur } from "@/domain/libur";
import { db } from "@/server/db";
import { entriLibur, kejadianLibur, snapshotLibur, user, type JenisKejadianLibur, type StatusSnapshotLibur } from "@/server/db/schema";
import type { Tx } from "@/server/impor/antrean";

// PRD B3 + ADR-0004: admin meninjau snapshot, lalu mengaktifkannya untuk tahunnya. Snapshot aktif lama menjadi arsip
// (tidak dihapus) dalam transaksi yang sama. Aktivasi hanya mengubah informasi libur; kategori tidak tersentuh.

type Klien = typeof db | Tx;

/** Kunci advisory (dua bilangan) untuk aktivasi libur per tahun; ruangnya terpisah dari kunci satu bilangan impor. */
const KUNCI_AKTIVASI_LIBUR = 41;

const PESAN_BERUBAH_SETELAH_DITINJAU =
  "Snapshot berubah setelah ditinjau. Muat ulang halaman dan tinjau ulang sebelum mengaktifkan.";

type EntriTinjau = { tanggal: string; keterangan: string; jenis: JenisLibur };

async function bacaEntri(klien: Klien, idSnapshot: number): Promise<EntriTinjau[]> {
  return klien
    .select({ tanggal: entriLibur.tanggal, keterangan: entriLibur.keterangan, jenis: entriLibur.jenis })
    .from(entriLibur)
    .where(eq(entriLibur.snapshotId, idSnapshot))
    .orderBy(asc(entriLibur.tanggal));
}

/**
 * Semua yang dilihat admin saat meninjau: status dan entri snapshot, serta snapshot aktif pembanding beserta entrinya.
 * Versi = sidik jari isi itu; jika berbeda saat aktivasi, perbedaan yang ditinjau sudah usang.
 */
async function bacaIsiTinjauan(klien: Klien, snapshot: { id: number; tahun: number; status: StatusSnapshotLibur }) {
  const entri = await bacaEntri(klien, snapshot.id);
  const [aktif] = await klien
    .select({ id: snapshotLibur.id })
    .from(snapshotLibur)
    .where(and(eq(snapshotLibur.tahun, snapshot.tahun), eq(snapshotLibur.status, "aktif")));
  const entriAktif = aktif && aktif.id !== snapshot.id ? await bacaEntri(klien, aktif.id) : null;
  const versi = createHash("sha256")
    .update(JSON.stringify({ status: snapshot.status, entri, idAktif: aktif?.id ?? null, entriAktif }))
    .digest("hex");
  return { entri, idSnapshotAktif: aktif?.id ?? null, entriAktif, versi };
}

type RiwayatSnapshotLibur = { jenis: JenisKejadianLibur; pelaku: string; terjadiPada: Date };

export type DataTinjauSnapshotLibur = {
  id: number;
  tahun: number;
  status: StatusSnapshotLibur;
  sumber: string;
  disinkronkanPada: Date;
  disinkronkanOleh: string;
  entri: EntriTinjau[];
  /** Snapshot aktif tahun yang sama (bisa snapshot ini sendiri), atau `null`. */
  idSnapshotAktif: number | null;
  /** Perbedaan terhadap snapshot aktif; `null` jika snapshot ini sendiri yang aktif. */
  perubahan: PerubahanLibur[] | null;
  persetujuanPertama: { oleh: string; pada: Date } | null;
  riwayat: RiwayatSnapshotLibur[];
  versi: string;
};

/** Data halaman tinjau snapshot libur, atau `null` jika snapshot tidak ada. */
export async function muatTinjauSnapshotLibur(idSnapshot: number): Promise<DataTinjauSnapshotLibur | null> {
  const [snapshot] = await db
    .select({
      id: snapshotLibur.id,
      tahun: snapshotLibur.tahun,
      status: snapshotLibur.status,
      sumber: snapshotLibur.sumber,
      disinkronkanPada: snapshotLibur.disinkronkanPada,
      disinkronkanOleh: user.name,
    })
    .from(snapshotLibur)
    .innerJoin(user, eq(user.id, snapshotLibur.disinkronkanOleh))
    .where(eq(snapshotLibur.id, idSnapshot));
  if (!snapshot) return null;

  const { entri, idSnapshotAktif, entriAktif, versi } = await bacaIsiTinjauan(db, snapshot);
  const riwayat = await db
    .select({ jenis: kejadianLibur.jenis, pelaku: user.name, terjadiPada: kejadianLibur.terjadiPada })
    .from(kejadianLibur)
    .innerJoin(user, eq(user.id, kejadianLibur.pelaku))
    .where(eq(kejadianLibur.snapshotId, snapshot.id))
    .orderBy(asc(kejadianLibur.terjadiPada), asc(kejadianLibur.id));
  const persetujuan = riwayat.find((r) => r.jenis === "persetujuan");

  return {
    ...snapshot,
    entri,
    idSnapshotAktif,
    perubahan: idSnapshotAktif === snapshot.id ? null : bandingkanDaftarLibur(entriAktif ?? [], entri),
    persetujuanPertama: persetujuan ? { oleh: persetujuan.pelaku, pada: persetujuan.terjadiPada } : null,
    riwayat,
    versi,
  };
}

export type HasilAktivasiLibur = { keadaan: "berhasil" } | { keadaan: "gagal"; pesan: string };

/**
 * Mengaktifkan snapshot yang sudah ditinjau dengan `versi` tertentu, dalam satu transaksi: snapshot aktif lama tahun
 * itu → arsip, snapshot ini → aktif, lalu kejadian dicatat (`persetujuan` pertama kali, `aktivasi-ulang` untuk arsip).
 */
export async function aktifkanSnapshotLibur(idSnapshot: number, versi: string, idPengguna: string): Promise<HasilAktivasiLibur> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(snapshotLibur).where(eq(snapshotLibur.id, idSnapshot)).for("update");
    if (!target) return { keadaan: "gagal", pesan: "Snapshot libur tidak ditemukan." };

    // Aktivasi tahun yang sama berjalan bergiliran, sehingga snapshot aktif pembanding tidak berubah di tengah jalan.
    await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI_AKTIVASI_LIBUR}, ${target.tahun})`);
    const isiKini = await bacaIsiTinjauan(tx, target);
    if (isiKini.versi !== versi) return { keadaan: "gagal", pesan: PESAN_BERUBAH_SETELAH_DITINJAU };
    if (target.status === "aktif") return { keadaan: "gagal", pesan: "Snapshot ini sudah aktif." };

    await tx
      .update(snapshotLibur)
      .set({ status: "diarsipkan" })
      .where(and(eq(snapshotLibur.tahun, target.tahun), eq(snapshotLibur.status, "aktif")));
    await tx.update(snapshotLibur).set({ status: "aktif" }).where(eq(snapshotLibur.id, target.id));
    await tx.insert(kejadianLibur).values({
      jenis: target.status === "menunggu-persetujuan" ? "persetujuan" : "aktivasi-ulang",
      tahun: target.tahun,
      snapshotId: target.id,
      pelaku: idPengguna,
    });
    return { keadaan: "berhasil" };
  });
}
