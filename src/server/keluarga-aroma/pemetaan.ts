import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { usulkanKeluargaAroma } from "@/domain/keluarga-aroma";
import { db } from "@/server/db";
import {
  daftarStatusKeluargaAroma,
  keluargaAroma,
  produk,
  riwayatPemetaanProduk,
  segmenKodeKeluargaAroma,
  user,
  type StatusKeluargaAroma,
} from "@/server/db/schema";

// Pemetaan produk ke keluarga aroma (issue T45, ADR-0006). Usulan dihitung dari segmen kode yang dicatat admin dan
// hanya ditampilkan; status produk baru berubah lewat `terapkanPemetaan` (konfirmasi admin), yang juga mencatat riwayat.
// Keluarga nonaktif tidak menjadi pilihan atau usulan untuk pemetaan baru; pemetaan lama ke keluarga yang kemudian
// dinonaktifkan tetap berlaku (PRD A6 ▶ Keputusan 2026-10-10, T53/T45; issue T67).

type Keluarga = { id: number; nama: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Keadaan pemetaan satu produk. `keluarga` terisi persis saat status `terpetakan`. */
export type Pemetaan = { status: StatusKeluargaAroma; keluarga: Keluarga | null };

/** Tujuan konfirmasi admin: tetapkan keluarga, tandai tanpa aroma, atau kembalikan ke belum dipetakan. */
export type TujuanPemetaan =
  | { status: "terpetakan"; idKeluarga: number }
  | { status: "tanpa-aroma" }
  | { status: "belum-dipetakan" };

export type ButirPemetaan = { kodeProduk: string; tujuan: TujuanPemetaan };

/** Hasil konfirmasi per produk (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export type HasilPemetaanProduk =
  | { kodeProduk: string; status: "berhasil"; dari: Pemetaan; ke: Pemetaan }
  | { kodeProduk: string; status: "tidakBerubah"; ke: Pemetaan }
  | { kodeProduk: string; status: "gagal"; pesan: string };

type BarisPemetaanProduk = {
  kode: string;
  nama: string;
  kategori: string;
  pemetaan: Pemetaan;
  /** Usulan dari segmen kode; hanya untuk produk `belum-dipetakan`. */
  usulan: Keluarga | null;
};

type RiwayatPemetaan = {
  id: number;
  kodeProduk: string;
  dari: Pemetaan;
  ke: Pemetaan;
  pelaku: string;
  terjadiPada: Date;
};

export type DataPemetaanProduk = {
  jumlahPerStatus: Record<StatusKeluargaAroma, number>;
  /** Produk sesuai filter status (`null` = semua), urut kode. */
  produk: BarisPemetaanProduk[];
  /** Produk `belum-dipetakan` yang punya usulan, tanpa memandang filter. */
  usulan: (BarisPemetaanProduk & { usulan: Keluarga })[];
  /** Keluarga aktif saja: pilihan untuk pemetaan baru. */
  keluarga: Keluarga[];
  riwayat: RiwayatPemetaan[];
};

/** Riwayat yang dimuat: perubahan terbaru lebih dulu. */
export const BATAS_RIWAYAT = 50;

function pemetaan(status: StatusKeluargaAroma, keluarga: Keluarga | null): Pemetaan {
  return { status, keluarga: status === "terpetakan" ? keluarga : null };
}

function keluargaDari(id: number | null, nama: string | null): Keluarga | null {
  return id !== null && nama !== null ? { id, nama } : null;
}

export async function muatPemetaanProduk(filterStatus: StatusKeluargaAroma | null): Promise<DataPemetaanProduk> {
  const semuaKeluarga = await db.select().from(keluargaAroma).orderBy(asc(keluargaAroma.nama), asc(keluargaAroma.id));
  const keluargaPerId = new Map(semuaKeluarga.map((k) => [k.id, { id: k.id, nama: k.nama }]));
  const idKeluargaAktif = new Set(semuaKeluarga.filter((k) => k.aktif).map((k) => k.id));
  // Usulan hanya dari segmen milik keluarga aktif: kode yang juga cocok ke segmen keluarga nonaktif tetap mendapat
  // usulan keluarga aktifnya (PRD A6 ▶ Keputusan 2026-10-10, T67; issue T70).
  const daftarSegmenAktif = (await db.select().from(segmenKodeKeluargaAroma))
    .filter((s) => idKeluargaAktif.has(s.keluargaId))
    .map((s) => ({ segmen: s.segmen, keluarga: s.keluargaId }));

  const jumlah = await db
    .select({ status: produk.statusKeluargaAroma, jumlah: count() })
    .from(produk)
    .groupBy(produk.statusKeluargaAroma);
  const jumlahPerStatus = Object.fromEntries(daftarStatusKeluargaAroma.map((s) => [s, 0])) as Record<
    StatusKeluargaAroma,
    number
  >;
  for (const j of jumlah) jumlahPerStatus[j.status] = j.jumlah;

  const semuaProduk = await db
    .select({
      kode: produk.kode,
      nama: produk.nama,
      kategori: produk.kategori,
      status: produk.statusKeluargaAroma,
      idKeluarga: produk.keluargaAromaId,
    })
    .from(produk)
    .orderBy(asc(produk.kode));

  const baris = semuaProduk.map((p): BarisPemetaanProduk => {
    const idUsulan = p.status === "belum-dipetakan" ? usulkanKeluargaAroma(p.kode, daftarSegmenAktif) : null;
    return {
      kode: p.kode,
      nama: p.nama,
      kategori: p.kategori,
      pemetaan: pemetaan(p.status, p.idKeluarga === null ? null : (keluargaPerId.get(p.idKeluarga) ?? null)),
      usulan: idUsulan === null ? null : (keluargaPerId.get(idUsulan) ?? null),
    };
  });

  const keluargaDariRiwayat = alias(keluargaAroma, "keluarga_dari");
  const keluargaKeRiwayat = alias(keluargaAroma, "keluarga_ke");
  const riwayat = await db
    .select({
      id: riwayatPemetaanProduk.id,
      kodeProduk: riwayatPemetaanProduk.kodeProduk,
      dariStatus: riwayatPemetaanProduk.dariStatus,
      dariId: keluargaDariRiwayat.id,
      dariNama: keluargaDariRiwayat.nama,
      keStatus: riwayatPemetaanProduk.keStatus,
      keId: keluargaKeRiwayat.id,
      keNama: keluargaKeRiwayat.nama,
      pelaku: user.name,
      terjadiPada: riwayatPemetaanProduk.terjadiPada,
    })
    .from(riwayatPemetaanProduk)
    .innerJoin(user, eq(user.id, riwayatPemetaanProduk.pelaku))
    .leftJoin(keluargaDariRiwayat, eq(keluargaDariRiwayat.id, riwayatPemetaanProduk.dariKeluargaId))
    .leftJoin(keluargaKeRiwayat, eq(keluargaKeRiwayat.id, riwayatPemetaanProduk.keKeluargaId))
    .orderBy(desc(riwayatPemetaanProduk.terjadiPada), desc(riwayatPemetaanProduk.id))
    .limit(BATAS_RIWAYAT);

  return {
    jumlahPerStatus,
    produk: filterStatus === null ? baris : baris.filter((b) => b.pemetaan.status === filterStatus),
    usulan: baris.filter((b): b is BarisPemetaanProduk & { usulan: Keluarga } => b.usulan !== null),
    keluarga: semuaKeluarga.filter((k) => k.aktif).map((k) => ({ id: k.id, nama: k.nama })),
    riwayat: riwayat.map((r) => ({
      id: r.id,
      kodeProduk: r.kodeProduk,
      dari: pemetaan(r.dariStatus, keluargaDari(r.dariId, r.dariNama)),
      ke: pemetaan(r.keStatus, keluargaDari(r.keId, r.keNama)),
      pelaku: r.pelaku,
      terjadiPada: r.terjadiPada,
    })),
  };
}

/**
 * Konfirmasi admin atas pemetaan produk, berurutan sesuai `butir`, dalam satu transaksi. Setiap perubahan dicatat di
 * riwayat (siapa, kapan, dari → ke). Hasil per produk. `induk` diisi transaksi pemanggil (seed data master, T88)
 * agar konfirmasi ikut transaksi itu (sebagai savepoint).
 */
export async function terapkanPemetaan(
  idPelaku: string,
  butir: readonly ButirPemetaan[],
  induk: typeof db | Tx = db,
): Promise<HasilPemetaanProduk[]> {
  return induk.transaction(async (tx) => {
    const idKeluarga = [
      ...new Set(butir.flatMap((b) => (b.tujuan.status === "terpetakan" ? [b.tujuan.idKeluarga] : []))),
    ];
    const daftarKeluarga =
      idKeluarga.length === 0 ? [] : await tx.select().from(keluargaAroma).where(inArray(keluargaAroma.id, idKeluarga));
    const keluargaPerId = new Map(daftarKeluarga.map((k) => [k.id, k]));

    const hasil: HasilPemetaanProduk[] = [];
    for (const { kodeProduk, tujuan } of butir) {
      const [saatIni] = await tx
        .select({ status: produk.statusKeluargaAroma, idKeluarga: produk.keluargaAromaId })
        .from(produk)
        .where(eq(produk.kode, kodeProduk))
        .for("update");
      if (!saatIni) {
        hasil.push({ kodeProduk, status: "gagal", pesan: "Produk tidak ditemukan." });
        continue;
      }

      let ke: Pemetaan = { status: tujuan.status, keluarga: null };
      let keluargaNonaktif = false;
      if (tujuan.status === "terpetakan") {
        const keluarga = keluargaPerId.get(tujuan.idKeluarga);
        if (!keluarga) {
          hasil.push({ kodeProduk, status: "gagal", pesan: "Keluarga aroma tidak ditemukan." });
          continue;
        }
        ke = { status: "terpetakan", keluarga: { id: keluarga.id, nama: keluarga.nama } };
        keluargaNonaktif = !keluarga.aktif;
      }

      const idKe = ke.keluarga?.id ?? null;
      if (saatIni.status === ke.status && saatIni.idKeluarga === idKe) {
        hasil.push({ kodeProduk, status: "tidakBerubah", ke });
        continue;
      }
      // Penetapan baru ke keluarga nonaktif ditolak; konfirmasi ulang pemetaan lama sudah lolos sebagai tidak berubah.
      if (keluargaNonaktif && ke.keluarga) {
        hasil.push({
          kodeProduk,
          status: "gagal",
          pesan: `Keluarga aroma ${ke.keluarga.nama} nonaktif. Pilih keluarga aroma yang aktif.`,
        });
        continue;
      }

      let keluargaLama: Keluarga | null = null;
      if (saatIni.idKeluarga !== null) {
        const [lama] = await tx
          .select({ id: keluargaAroma.id, nama: keluargaAroma.nama })
          .from(keluargaAroma)
          .where(eq(keluargaAroma.id, saatIni.idKeluarga));
        keluargaLama = lama ?? null;
      }

      await tx.update(produk).set({ statusKeluargaAroma: ke.status, keluargaAromaId: idKe }).where(eq(produk.kode, kodeProduk));
      await tx.insert(riwayatPemetaanProduk).values({
        kodeProduk,
        dariStatus: saatIni.status,
        dariKeluargaId: saatIni.idKeluarga,
        keStatus: ke.status,
        keKeluargaId: idKe,
        pelaku: idPelaku,
      });
      hasil.push({ kodeProduk, status: "berhasil", dari: pemetaan(saatIni.status, keluargaLama), ke });
    }
    return hasil;
  });
}
