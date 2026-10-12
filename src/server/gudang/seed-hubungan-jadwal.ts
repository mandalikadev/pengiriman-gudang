import { and, asc, eq, inArray } from "drizzle-orm";

import type { MasukanJadwal } from "@/domain/jadwal";
import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, jadwalToko, toko, user } from "@/server/db/schema";

import { bacaJadwalAktif, jadwalDariMasukan, type Tx } from "./jadwal";

// Seed UAT (T84): hubungan toko–gudang dan jadwal aktif awal dari lampiran pemilik, persis tabel
// PRD A5 ▶ Keputusan (2026-10-12) dan daftar PRD A3 ▶ Keputusan (2026-10-12, OD-12 sebagian).
// Data awal atas nama admin pertama; perubahan berikutnya mengikuti alur usulan–persetujuan.

type BarisJadwalAwal = { gudang: string; toko: string } & MasukanJadwal;

const H1 = "H-1" as const;

const mingguan = (hari: MasukanJadwal["hariKirim"][number]["hari"], persiapan: MasukanJadwal["hariKirim"][number]["persiapan"]) =>
  ({ pola: "mingguan", hariKirim: [{ hari, persiapan }], tanggalJangkar: null }) as const;

/** Tabel PRD A5 ▶ Keputusan (2026-10-12, UAT): 20 toko. PMS, PMJ, QUEEN, MKS, DPM tetap terbuka (OD-12). */
const JADWAL_AWAL: readonly BarisJadwalAwal[] = [
  { gudang: "Gudang Cibubur", toko: "SMB", pola: "2x-seminggu", hariKirim: [{ hari: "Senin", persiapan: "H" }, { hari: "Kamis", persiapan: H1 }], tanggalJangkar: null },
  { gudang: "Gudang Cibubur", toko: "BOTANI", pola: "2x-seminggu", hariKirim: [{ hari: "Senin", persiapan: "H" }, { hari: "Kamis", persiapan: H1 }], tanggalJangkar: null },
  { gudang: "Gudang Cibubur", toko: "MKG", pola: "2x-seminggu", hariKirim: [{ hari: "Selasa", persiapan: H1 }, { hari: "Jumat", persiapan: H1 }], tanggalJangkar: null },
  { gudang: "Gudang Cibubur", toko: "KOKAS", pola: "2x-seminggu", hariKirim: [{ hari: "Selasa", persiapan: H1 }, { hari: "Jumat", persiapan: H1 }], tanggalJangkar: null },
  { gudang: "Gudang Cibubur", toko: "SMS", pola: "2x-seminggu", hariKirim: [{ hari: "Selasa", persiapan: H1 }, { hari: "Jumat", persiapan: H1 }], tanggalJangkar: null },
  { gudang: "Gudang Cibubur", toko: "ALSUT", ...mingguan("Selasa", H1) },
  { gudang: "Gudang Cibubur", toko: "BXC", pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: H1 }], tanggalJangkar: "2026-10-14" },
  { gudang: "Gudang Cibubur", toko: "KARAWACI", ...mingguan("Rabu", H1) },
  { gudang: "Gudang Cibubur", toko: "CCM", pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: H1 }], tanggalJangkar: "2026-10-21" },
  { gudang: "Gudang Cibubur", toko: "BSD", ...mingguan("Rabu", H1) },
  { gudang: "Gudang Cibubur", toko: "DELTAMAS", ...mingguan("Kamis", H1) },
  { gudang: "Gudang Cibubur", toko: "PMB", ...mingguan("Kamis", "H-2") },
  { gudang: "Gudang Cibubur", toko: "KUNCIT", ...mingguan("Jumat", H1) },
  { gudang: "Gudang Cibubur", toko: "TSM CBB", ...mingguan("Jumat", "H") },
  { gudang: "Gudang Cibubur", toko: "SENTUL", ...mingguan("Sabtu", H1) },
  { gudang: "Gudang Cibubur", toko: "LMK", ...mingguan("Sabtu", H1) },
  { gudang: "Gudang Bali", toko: "DMB", ...mingguan("Senin", H1) },
  { gudang: "Gudang Bali", toko: "LWB", pola: "3x-seminggu", hariKirim: [{ hari: "Senin", persiapan: H1 }, { hari: "Rabu", persiapan: H1 }, { hari: "Jumat", persiapan: H1 }], tanggalJangkar: null },
  { gudang: "Gudang Bandung", toko: "PASKAL", pola: "2x-seminggu", hariKirim: [{ hari: "Senin", persiapan: H1 }, { hari: "Jumat", persiapan: H1 }], tanggalJangkar: null },
  { gudang: "Gudang Bandung", toko: "PVJ", ...mingguan("Selasa", H1) },
];

export const PESAN_TANPA_ADMIN = "Jalankan pnpm db:seed-admin dulu.";

type HasilSeedHubunganJadwal =
  | { keadaan: "berhasil"; hubunganDibuat: number; jadwalDibuat: number }
  | { keadaan: "gagal"; pesan: typeof PESAN_TANPA_ADMIN };

/** Admin aktif (peran admin, tidak dinonaktifkan) yang paling awal dibuat, atau `null`. */
export async function adminPertama(tx: Tx) {
  const [baris] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.banned, false)))
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1);
  return baris?.id ?? null;
}

async function idMenurutNama(tx: Tx, tabel: typeof gudang | typeof toko, nama: readonly string[], jenis: string) {
  const baris = await tx.select({ id: tabel.id, nama: tabel.nama }).from(tabel).where(inArray(tabel.nama, [...nama]));
  const peta = new Map(baris.map((b) => [b.nama, b.id]));
  const hilang = nama.filter((n) => !peta.has(n));
  if (hilang.length > 0) {
    throw new Error(`${jenis} belum ada di master: ${hilang.join(", ")}. Jalankan seedMasterGudangToko dulu.`);
  }
  return peta;
}

/**
 * Mengisi hubungan toko–gudang dan jadwal aktif awal sesuai `JADWAL_AWAL`, dalam satu transaksi, atas nama admin aktif
 * yang paling awal dibuat. Idempoten: hubungan hanya dibuat untuk toko yang belum punya hubungan (ke gudang mana pun);
 * jadwal hanya dibuat untuk toko yang belum punya jadwal aktif. Baris yang sudah ada tidak diubah.
 * Tanpa admin aktif → gagal tanpa menulis apa pun. Setiap jadwal divalidasi `periksaJadwal` (lewat `jadwalDariMasukan`,
 * bentuk simpan sama dengan `simpanJadwalToko`).
 */
export async function seedHubunganJadwalAwal(): Promise<HasilSeedHubunganJadwal> {
  return db.transaction(async (tx) => {
    const idAdmin = await adminPertama(tx);
    if (idAdmin === null) return { keadaan: "gagal", pesan: PESAN_TANPA_ADMIN };

    const idGudang = await idMenurutNama(tx, gudang, [...new Set(JADWAL_AWAL.map((b) => b.gudang))], "Gudang");
    const idToko = await idMenurutNama(tx, toko, JADWAL_AWAL.map((b) => b.toko), "Toko");

    let hubunganDibuat = 0;
    let jadwalDibuat = 0;
    for (const baris of JADWAL_AWAL) {
      const tokoId = idToko.get(baris.toko)!;
      const hasil = jadwalDariMasukan(baris);
      if ("pesan" in hasil) throw new Error(`Jadwal awal ${baris.toko} tidak valid: ${hasil.pesan}`);

      const hubungan = await tx
        .insert(hubunganTokoGudang)
        .values({ tokoId, gudangId: idGudang.get(baris.gudang)! })
        .onConflictDoNothing({ target: hubunganTokoGudang.tokoId })
        .returning({ tokoId: hubunganTokoGudang.tokoId });
      hubunganDibuat += hubungan.length;

      if ((await bacaJadwalAktif(tx, tokoId)) === null) {
        await tx.insert(jadwalToko).values({
          tokoId,
          pola: hasil.jadwal.pola,
          hariKirim: [...hasil.jadwal.hariKirim],
          tanggalJangkar: hasil.jadwal.tanggalJangkar,
          dibuatOleh: idAdmin,
        });
        jadwalDibuat += 1;
      }
    }
    return { keadaan: "berhasil", hubunganDibuat, jadwalDibuat };
  });
}
