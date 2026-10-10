import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { cocokkanKeluargaAroma } from "@/domain/keluarga-aroma";
import { db } from "@/server/db";
import {
  aliasKeluargaAroma,
  barisRanking,
  keluargaAroma,
  user,
  versiRanking,
  type StatusVersiRanking,
} from "@/server/db/schema";
import type { Tx } from "@/server/impor/antrean";
import { ambilObjek } from "@/server/impor/penyimpanan";

import { bacaFileRanking } from "./baca-file-ranking";

// Siklus ranking pusat (issue T53, PRD A6 ▶ OD-05, ADR-0006): unggah → draft (validasi T52 + pencocokan alias) →
// cocokkan ulang (setelah admin menambah alias) → publikasi. Ranking berlaku = versi terakhir yang dipublikasikan,
// untuk semua gudang; versi berlaku sebelumnya diarsipkan dalam transaksi yang sama. Kewenangan admin diperiksa
// pemanggil (server action / halaman).

const AWALAN_KUNCI = "ranking/";
const POLA_KUNCI = /^ranking\/[0-9a-f-]{36}$/;
const JUMLAH_TUJUH_BESAR = 7;

/** Ruang kunci advisory (dua bilangan) ranking; terpisah dari impor (satu bilangan) dan libur (41). */
const KUNCI_RANKING = 53;
/** Kunci kedua untuk publikasi; nomor versi per bulan memakai `YYYYMM` sebagai kunci kedua. */
const KUNCI_PUBLIKASI = 0;

type Klien = typeof db | Tx;

export type HasilGagal = { keadaan: "gagal"; pesan: string };

type Keluarga = { id: number; nama: string };
type KeluargaTinjau = Keluarga & { aktif: boolean };

/** Satu keluarga aroma yang cocok dengan lebih dari satu baris ranking (menahan publikasi, PRD A6 ▶ 2026-10-10). */
export type KeluargaGanda = { keluarga: KeluargaTinjau; baris: { rank: number; variant: string }[] };

/** Keluarga yang muncul di lebih dari satu baris, urut rank baris pertamanya; `baris` diharapkan urut rank. */
function cariKeluargaGanda(baris: readonly { rank: number; variant: string; keluarga: KeluargaTinjau | null }[]): KeluargaGanda[] {
  const perKeluarga = new Map<number, KeluargaGanda>();
  for (const b of baris) {
    if (b.keluarga === null) continue;
    const kelompok = perKeluarga.get(b.keluarga.id) ?? { keluarga: b.keluarga, baris: [] };
    kelompok.baris.push({ rank: b.rank, variant: b.variant });
    perKeluarga.set(b.keluarga.id, kelompok);
  }
  return [...perKeluarga.values()].filter((k) => k.baris.length > 1);
}

function gabungDaftar(teks: readonly string[]) {
  if (teks.length <= 2) return teks.join(" dan ");
  return `${teks.slice(0, -1).join(", ")}, dan ${teks.at(-1)}`;
}

/** Kunci objek baru di storage untuk satu unggahan file ranking. */
export function kunciObjekRankingBaru() {
  return `${AWALAN_KUNCI}${randomUUID()}`;
}

/** Kode bulan ranking `YYYY-MM`. */
export function kodeBulanRanking(tahun: number, bulan: number) {
  return `${tahun}-${String(bulan).padStart(2, "0")}`;
}

async function daftarAlias(klien: Klien) {
  const baris = await klien
    .select({ alias: aliasKeluargaAroma.alias, id: keluargaAroma.id, nama: keluargaAroma.nama, aktif: keluargaAroma.aktif })
    .from(aliasKeluargaAroma)
    .innerJoin(keluargaAroma, eq(keluargaAroma.id, aliasKeluargaAroma.keluargaId));
  // Keluarga nonaktif tetap boleh dicocokkan (PRD A6 ▶ 2026-10-10); di halaman tinjau barisnya diberi peringatan.
  return baris.map((b) => ({ alias: b.alias, keluarga: { id: b.id, nama: b.nama, aktif: b.aktif } }));
}

type MasukanDaftar = { kunci: string; namaFile: string; bulanRanking: string; idPengguna: string };

/**
 * Membaca file yang sudah ada di storage (T52) dan mendaftarkannya sebagai versi ranking `draft` untuk bulan ranking
 * pilihan admin. Versi = nomor urut berikutnya untuk bulan itu. File dengan error validasi tetap didaftarkan (errornya
 * tampil di halaman tinjau) tanpa baris. Setiap baris valid langsung dicocokkan ke keluarga aroma lewat alias.
 */
export async function daftarkanRanking(masukan: MasukanDaftar): Promise<{ keadaan: "berhasil"; idVersi: number } | HasilGagal> {
  if (!POLA_KUNCI.test(masukan.kunci)) {
    return { keadaan: "gagal", pesan: "File unggahan tidak dikenal. Unggah ulang file-nya." };
  }
  const isi = await ambilObjek(masukan.kunci);
  if (isi === null) return { keadaan: "gagal", pesan: "File belum ada di storage. Unggah ulang file-nya." };

  let hasil: ReturnType<typeof bacaFileRanking>;
  try {
    hasil = bacaFileRanking(isi);
  } catch {
    return { keadaan: "gagal", pesan: "File ini tidak bisa dibaca sebagai workbook Excel. Pilih file .xlsx yang benar." };
  }

  return db.transaction(async (tx) => {
    // Nomor versi per bulan ranking dibagikan bergiliran.
    const kunciBulan = Number(masukan.bulanRanking.replace("-", ""));
    await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI_RANKING}, ${kunciBulan})`);
    const [terakhir] = await tx
      .select({ versi: sql<number>`coalesce(max(${versiRanking.versi}), 0)`.mapWith(Number) })
      .from(versiRanking)
      .where(eq(versiRanking.bulanRanking, masukan.bulanRanking));

    const [baru] = await tx
      .insert(versiRanking)
      .values({
        bulanRanking: masukan.bulanRanking,
        versi: terakhir.versi + 1,
        namaFile: masukan.namaFile,
        ukuranByte: isi.byteLength,
        kunciObjek: masukan.kunci,
        errorValidasi: hasil.ok ? [] : hasil.error,
        diunggahOleh: masukan.idPengguna,
      })
      .onConflictDoNothing({ target: versiRanking.kunciObjek })
      .returning({ id: versiRanking.id });
    if (!baru) return { keadaan: "gagal", pesan: "File ini sudah didaftarkan sebagai ranking." } as const;

    if (hasil.ok && hasil.baris.length > 0) {
      const alias = await daftarAlias(tx);
      await tx.insert(barisRanking).values(
        hasil.baris.map((b) => ({
          versiId: baru.id,
          rank: b.rank,
          variant: b.variant,
          qtySales: b.qtySales,
          keluargaAromaId: cocokkanKeluargaAroma(b.variant, alias)?.id ?? null,
        })),
      );
    }
    return { keadaan: "berhasil", idVersi: baru.id } as const;
  });
}

/** Alasan versi tidak bisa dipublikasikan, atau `null` jika bisa. Dipakai publikasi dan tombol Publikasikan. */
function alasanTidakBisaDipublikasikan({
  status,
  jumlahError,
  tidakCocok,
  keluargaGanda,
}: {
  status: StatusVersiRanking;
  jumlahError: number;
  /** VARIANT baris yang tidak cocok dengan alias mana pun. */
  tidakCocok: readonly string[];
  keluargaGanda: readonly KeluargaGanda[];
}): string | null {
  if (status === "dipublikasikan") return "Ranking ini sudah dipublikasikan dan sedang berlaku.";
  if (status === "diarsipkan") return "Ranking ini sudah diarsipkan dan tidak bisa dipublikasikan lagi.";
  if (jumlahError > 0) {
    return `Tidak bisa dipublikasikan: ada ${jumlahError} error di file. Perbaiki di Excel, lalu unggah ulang.`;
  }
  if (tidakCocok.length > 0) {
    return `Tidak bisa dipublikasikan: ${tidakCocok.length} baris tidak cocok dengan alias mana pun (${tidakCocok.join(", ")}). Tambahkan aliasnya di halaman Keluarga aroma, lalu cocokkan ulang.`;
  }
  if (keluargaGanda.length > 0) {
    const rincian = keluargaGanda
      .map((k) => `${k.keluarga.nama} muncul di ${gabungDaftar(k.baris.map((b) => `RANK ${b.rank} (${b.variant})`))}`)
      .join("; ");
    return `Tidak bisa dipublikasikan: satu keluarga aroma hanya boleh muncul di satu baris ranking. ${rincian}. Perbaiki aliasnya di halaman Keluarga aroma, lalu cocokkan ulang.`;
  }
  return null;
}

async function kunciVersi(tx: Tx, idVersi: number) {
  const [target] = await tx
    .select({ id: versiRanking.id, status: versiRanking.status, errorValidasi: versiRanking.errorValidasi })
    .from(versiRanking)
    .where(eq(versiRanking.id, idVersi))
    .for("update");
  return target ?? null;
}

async function bacaBaris(klien: Klien, idVersi: number) {
  return klien
    .select({ id: barisRanking.id, rank: barisRanking.rank, variant: barisRanking.variant, keluargaAromaId: barisRanking.keluargaAromaId })
    .from(barisRanking)
    .where(eq(barisRanking.versiId, idVersi))
    .orderBy(asc(barisRanking.rank));
}

/**
 * Mencocokkan ulang setiap baris versi `draft` ke keluarga aroma dengan alias saat ini (setelah admin menambah alias,
 * T44). Mengembalikan jumlah baris yang masih tidak cocok.
 */
export async function cocokkanUlangRanking(idVersi: number): Promise<{ keadaan: "berhasil"; jumlahTidakCocok: number } | HasilGagal> {
  return db.transaction(async (tx) => {
    const target = await kunciVersi(tx, idVersi);
    if (!target) return { keadaan: "gagal", pesan: "Ranking tidak ditemukan." } as const;
    if (target.status !== "draft") {
      return { keadaan: "gagal", pesan: "Hanya ranking berstatus draft yang bisa dicocokkan ulang." } as const;
    }
    const alias = await daftarAlias(tx);
    let jumlahTidakCocok = 0;
    for (const b of await bacaBaris(tx, idVersi)) {
      const cocok = cocokkanKeluargaAroma(b.variant, alias)?.id ?? null;
      if (cocok === null) jumlahTidakCocok++;
      if (cocok !== b.keluargaAromaId) {
        await tx.update(barisRanking).set({ keluargaAromaId: cocok }).where(eq(barisRanking.id, b.id));
      }
    }
    return { keadaan: "berhasil", jumlahTidakCocok } as const;
  });
}

/**
 * Mempublikasikan versi `draft` dalam satu transaksi: versi ini menjadi ranking berlaku untuk semua gudang, versi
 * berlaku sebelumnya diarsipkan. Pencocokan diperiksa ulang dengan alias saat ini: baris yang tidak cocok dan keluarga
 * yang muncul di lebih dari satu baris menahan publikasi (ADR-0006, PRD A6 ▶ 2026-10-10), dan hasil cocok yang berbeda dari yang ditinjau meminta admin mencocokkan ulang dulu.
 */
export async function publikasikanRanking(idVersi: number, idPengguna: string): Promise<{ keadaan: "berhasil" } | HasilGagal> {
  return db.transaction(async (tx) => {
    // Publikasi berjalan bergiliran: hanya satu ranking berlaku.
    await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI_RANKING}, ${KUNCI_PUBLIKASI})`);
    const target = await kunciVersi(tx, idVersi);
    if (!target) return { keadaan: "gagal", pesan: "Ranking tidak ditemukan." } as const;

    const alias = await daftarAlias(tx);
    const baris = (await bacaBaris(tx, idVersi)).map((b) => ({ ...b, keluarga: cocokkanKeluargaAroma(b.variant, alias) }));
    const alasan = alasanTidakBisaDipublikasikan({
      status: target.status,
      jumlahError: target.errorValidasi.length,
      tidakCocok: baris.filter((b) => b.keluarga === null).map((b) => b.variant),
      keluargaGanda: cariKeluargaGanda(baris),
    });
    if (alasan) return { keadaan: "gagal", pesan: alasan } as const;
    if (baris.some((b) => (b.keluarga?.id ?? null) !== b.keluargaAromaId)) {
      return {
        keadaan: "gagal",
        pesan: "Alias berubah sejak ranking ini dicocokkan. Tekan Cocokkan ulang, tinjau hasilnya, lalu publikasikan.",
      } as const;
    }

    await tx
      .update(versiRanking)
      .set({ status: "diarsipkan", diarsipkanPada: sql`now()` })
      .where(and(eq(versiRanking.status, "dipublikasikan"), ne(versiRanking.id, idVersi)));
    await tx
      .update(versiRanking)
      .set({ status: "dipublikasikan", dipublikasikanOleh: idPengguna, dipublikasikanPada: sql`now()` })
      .where(eq(versiRanking.id, idVersi));
    return { keadaan: "berhasil" } as const;
  });
}

type PeringkatTujuhBesar = { rank: number; variant: string; keluarga: Keluarga };

/** Ranking pusat yang berlaku untuk semua gudang. */
export type RankingBerlaku = {
  /**
   * Sinyal perubahan ranking (T61) = id versi ranking yang berlaku. Berubah setiap kali ranking lain dipublikasikan,
   * jadi hasil yang menyimpan nilai ini bisa dibandingkan dengan nilai saat ini untuk tahu apakah rankingnya berubah.
   */
  idVersi: number;
  bulanRanking: string;
  versi: number;
  /** RANK 1–7 persis seperti di file (PRD A6 ▶ OD-05), urut rank, sebagai keluarga aroma hasil cocok. */
  tujuhBesar: PeringkatTujuhBesar[];
};

/**
 * Ranking yang berlaku (terakhir dipublikasikan), atau `null` jika belum ada ranking yang dipublikasikan (perhitungan
 * tidak berjalan, PRD A6). `klien` = transaksi pemanggil bila ranking harus dibaca dalam snapshot yang sama. Pemeriksaan
 * akses dilakukan pemanggil.
 */
export async function rankingBerlaku(klien: Klien = db): Promise<RankingBerlaku | null> {
  const [versi] = await klien
    .select({
      idVersi: versiRanking.id,
      bulanRanking: versiRanking.bulanRanking,
      versi: versiRanking.versi,
    })
    .from(versiRanking)
    .where(eq(versiRanking.status, "dipublikasikan"));
  if (!versi) return null;
  const tujuhBesar = await klien
    .select({
      rank: barisRanking.rank,
      variant: barisRanking.variant,
      keluarga: { id: keluargaAroma.id, nama: keluargaAroma.nama },
    })
    .from(barisRanking)
    .innerJoin(keluargaAroma, eq(keluargaAroma.id, barisRanking.keluargaAromaId))
    .where(and(eq(barisRanking.versiId, versi.idVersi), lte(barisRanking.rank, JUMLAH_TUJUH_BESAR)))
    .orderBy(asc(barisRanking.rank));
  return { ...versi, tujuhBesar };
}

const pengunggah = alias(user, "pengunggah");
const penerbit = alias(user, "penerbit");

const kolomIdentitas = {
  id: versiRanking.id,
  bulanRanking: versiRanking.bulanRanking,
  versi: versiRanking.versi,
  namaFile: versiRanking.namaFile,
  ukuranByte: versiRanking.ukuranByte,
  status: versiRanking.status,
  diunggahOleh: pengunggah.name,
  diunggahPada: versiRanking.diunggahPada,
  dipublikasikanOleh: penerbit.name,
  dipublikasikanPada: versiRanking.dipublikasikanPada,
  diarsipkanPada: versiRanking.diarsipkanPada,
  errorValidasi: versiRanking.errorValidasi,
};

function pilihIdentitas() {
  return db
    .select(kolomIdentitas)
    .from(versiRanking)
    .innerJoin(pengunggah, eq(pengunggah.id, versiRanking.diunggahOleh))
    .leftJoin(penerbit, eq(penerbit.id, versiRanking.dipublikasikanOleh));
}

/** Semua versi ranking, terbaru dulu (halaman admin). */
export async function muatDaftarRanking() {
  return pilihIdentitas().orderBy(desc(versiRanking.id));
}

type BarisTinjau = { rank: number; variant: string; qtySales: number; keluarga: KeluargaTinjau | null };

/** Data halaman tinjau satu versi ranking, atau `null` jika tidak ada. */
export async function muatTinjauRanking(idVersi: number) {
  const [identitas] = await pilihIdentitas().where(eq(versiRanking.id, idVersi));
  if (!identitas) return null;

  const daftarBaris = await db
    .select({
      rank: barisRanking.rank,
      variant: barisRanking.variant,
      qtySales: barisRanking.qtySales,
      keluargaId: keluargaAroma.id,
      keluargaNama: keluargaAroma.nama,
      keluargaAktif: keluargaAroma.aktif,
    })
    .from(barisRanking)
    .leftJoin(keluargaAroma, eq(keluargaAroma.id, barisRanking.keluargaAromaId))
    .where(eq(barisRanking.versiId, idVersi))
    .orderBy(asc(barisRanking.rank));
  const baris: BarisTinjau[] = daftarBaris.map((b) => ({
    rank: b.rank,
    variant: b.variant,
    qtySales: b.qtySales,
    keluarga:
      b.keluargaId === null || b.keluargaNama === null || b.keluargaAktif === null
        ? null
        : { id: b.keluargaId, nama: b.keluargaNama, aktif: b.keluargaAktif },
  }));
  const tidakCocok = baris.filter((b) => b.keluarga === null).map((b) => b.variant);
  const keluargaGanda = cariKeluargaGanda(baris);

  const [berlakuLain] = await db
    .select({ bulanRanking: versiRanking.bulanRanking, versi: versiRanking.versi })
    .from(versiRanking)
    .where(and(eq(versiRanking.status, "dipublikasikan"), ne(versiRanking.id, idVersi)));

  return {
    ...identitas,
    baris,
    tidakCocok,
    keluargaGanda,
    tujuhBesar: baris.filter((b) => b.rank <= JUMLAH_TUJUH_BESAR),
    alasanTidakBisaDipublikasikan: alasanTidakBisaDipublikasikan({
      status: identitas.status,
      jumlahError: identitas.errorValidasi.length,
      tidakCocok,
      keluargaGanda,
    }),
    /** Ranking berlaku saat ini yang akan diarsipkan bila versi ini dipublikasikan. */
    rankingBerlakuLain: berlakuLain ?? null,
  };
}

export type DataTinjauRanking = NonNullable<Awaited<ReturnType<typeof muatTinjauRanking>>>;
