import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { periksaDaftarLibur } from "@/domain/libur";
import { db } from "@/server/db";
import { entriLibur, kejadianLibur, snapshotLibur, user, type StatusSnapshotLibur } from "@/server/db/schema";

// PRD B2: ambil satu tahun dari API Hari Libur, validasi, simpan sebagai snapshot menunggu persetujuan.
// Snapshot yang sudah ada (termasuk yang aktif) tidak pernah diubah oleh sinkronisasi.

const URL_API_HARI_LIBUR = "https://api-hari-libur.vercel.app/api";
const BATAS_WAKTU_MS = 15_000;

function urlSumberLibur(tahun: number) {
  return `${URL_API_HARI_LIBUR}?year=${tahun}`;
}

// Hanya `data[].date` dan `data[].description` yang dibaca (bukan field provider lama `tanggal`/`keterangan`/`is_cuti`).
const skemaRespons = z.object({
  data: z.array(z.object({ date: z.string(), description: z.string() })),
});

export type HasilSinkronisasi =
  | { keadaan: "berhasil"; idSnapshot: number; jumlahLibur: number }
  | { keadaan: "gagal"; pesan: string };

type HasilAmbil = { keadaan: "berhasil"; data: { tanggal: string; keterangan: string }[] } | { keadaan: "gagal"; pesan: string };

async function ambilDariApi(tahun: number): Promise<HasilAmbil> {
  let jawaban: Response;
  try {
    jawaban = await fetch(urlSumberLibur(tahun), {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(BATAS_WAKTU_MS),
    });
  } catch {
    return { keadaan: "gagal", pesan: "API Hari Libur tidak dapat dihubungi atau tidak menjawab tepat waktu." };
  }
  if (!jawaban.ok) return { keadaan: "gagal", pesan: `API Hari Libur menjawab dengan kode ${jawaban.status}.` };

  let isi: unknown;
  try {
    isi = await jawaban.json();
  } catch {
    return { keadaan: "gagal", pesan: "Respons API Hari Libur bukan JSON yang valid." };
  }
  const respons = skemaRespons.safeParse(isi);
  if (!respons.success) {
    return {
      keadaan: "gagal",
      pesan: "Respons API Hari Libur tidak sesuai format: diharapkan daftar `data` berisi `date` dan `description`.",
    };
  }
  return {
    keadaan: "berhasil",
    data: respons.data.data.map((d) => ({ tanggal: d.date, keterangan: d.description })),
  };
}

/** Sinkronisasi satu tahun. Gagal → tidak ada snapshot baru; kegagalan dicatat di riwayat kejadian. */
export async function sinkronkanLibur(tahun: number, idPengguna: string): Promise<HasilSinkronisasi> {
  const ambil = await ambilDariApi(tahun);
  const periksa = ambil.keadaan === "berhasil" ? periksaDaftarLibur(tahun, ambil.data) : ambil;
  if (periksa.keadaan !== "valid") {
    await db.insert(kejadianLibur).values({ jenis: "sinkronisasi-gagal", tahun, pesan: periksa.pesan, pelaku: idPengguna });
    return { keadaan: "gagal", pesan: periksa.pesan };
  }

  return db.transaction(async (tx) => {
    const [snapshot] = await tx
      .insert(snapshotLibur)
      .values({ tahun, status: "menunggu-persetujuan", sumber: urlSumberLibur(tahun), disinkronkanOleh: idPengguna })
      .returning({ id: snapshotLibur.id });
    if (periksa.entri.length > 0) {
      await tx
        .insert(entriLibur)
        .values(periksa.entri.map((e) => ({ snapshotId: snapshot.id, ...e, jenisUsulan: true })));
    }
    await tx
      .insert(kejadianLibur)
      .values({ jenis: "sinkronisasi-berhasil", tahun, snapshotId: snapshot.id, pelaku: idPengguna });
    return { keadaan: "berhasil", idSnapshot: snapshot.id, jumlahLibur: periksa.entri.length };
  });
}

export type RingkasanSnapshotLibur = {
  id: number;
  tahun: number;
  status: StatusSnapshotLibur;
  sumber: string;
  disinkronkanPada: Date;
  disinkronkanOleh: string;
  jumlahLibur: number;
};

export type KegagalanSinkronisasi = { tahun: number; pesan: string; pelaku: string; terjadiPada: Date };

/** Daftar snapshot (terbaru dulu) dan kegagalan sinkronisasi terakhir, untuk halaman admin Libur. */
export async function muatDataLibur(): Promise<{
  daftarSnapshot: RingkasanSnapshotLibur[];
  kegagalanTerakhir: KegagalanSinkronisasi | null;
}> {
  const daftarSnapshot = await db
    .select({
      id: snapshotLibur.id,
      tahun: snapshotLibur.tahun,
      status: snapshotLibur.status,
      sumber: snapshotLibur.sumber,
      disinkronkanPada: snapshotLibur.disinkronkanPada,
      disinkronkanOleh: user.name,
      jumlahLibur: count(entriLibur.id),
    })
    .from(snapshotLibur)
    .innerJoin(user, eq(user.id, snapshotLibur.disinkronkanOleh))
    .leftJoin(entriLibur, eq(entriLibur.snapshotId, snapshotLibur.id))
    .groupBy(snapshotLibur.id, user.name)
    .orderBy(desc(snapshotLibur.disinkronkanPada), desc(snapshotLibur.id));

  const [kegagalanTerakhir] = await db
    .select({
      tahun: kejadianLibur.tahun,
      pesan: kejadianLibur.pesan,
      pelaku: user.name,
      terjadiPada: kejadianLibur.terjadiPada,
    })
    .from(kejadianLibur)
    .innerJoin(user, eq(user.id, kejadianLibur.pelaku))
    .where(eq(kejadianLibur.jenis, "sinkronisasi-gagal"))
    .orderBy(desc(kejadianLibur.terjadiPada), desc(kejadianLibur.id))
    .limit(1);

  return {
    daftarSnapshot,
    kegagalanTerakhir: kegagalanTerakhir ? { ...kegagalanTerakhir, pesan: kegagalanTerakhir.pesan ?? "" } : null,
  };
}

