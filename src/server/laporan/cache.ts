import { asc, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { posisiLaporan, parseTanggalBisnis, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
import { kategoriEfektif, type PerubahanKategori } from "@/domain/kategori";
import { hitungLaporan, type Pengamatan } from "@/domain/laporan";
import { db } from "@/server/db";
import {
  cacheNilaiMingguan,
  cacheRataRataBulanan,
  cacheTotalPenjualanMentah,
  cakupanTanggalImpor,
  impor,
  revisiKalender,
  selPenjualan,
  versiCacheLaporan,
} from "@/server/db/schema";
import { kirimJobHitungCacheLaporan, type Tx } from "@/server/impor/antrean";

// Cache hasil hitung laporan (T33, ADR-0002). Nilai mingguan, rata-rata bulanan, dan total penjualan mentah
// dihitung worker dengan `hitungLaporan` dari sel penjualan + cakupan tanggal semua impor aktif. Kunci versi =
// set impor aktif + revisi kalender. Halaman hanya membaca cache; tidak membaca Excel atau menghitung (PRD C1).

type Klien = typeof db | Tx;

const UKURAN_BATCH = 1000;
const MAKS_BULAN_PER_HITUNG = 12;

type KunciVersi = { imporAktif: number[]; revisiKalender: number };

function kunciSama(a: KunciVersi, b: KunciVersi) {
  return (
    a.revisiKalender === b.revisiKalender &&
    a.imporAktif.length === b.imporAktif.length &&
    a.imporAktif.every((id, i) => id === b.imporAktif[i])
  );
}

async function bacaRevisiKalender(klien: Klien): Promise<number> {
  const [baris] = await klien.select({ revisi: revisiKalender.revisi }).from(revisiKalender).where(eq(revisiKalender.id, 1));
  return baris?.revisi ?? 0;
}

async function bacaKunciVersi(klien: Klien): Promise<KunciVersi> {
  const aktif = await klien.select({ id: impor.id }).from(impor).where(eq(impor.status, "aktif")).orderBy(asc(impor.id));
  return { imporAktif: aktif.map((i) => i.id), revisiKalender: await bacaRevisiKalender(klien) };
}

/**
 * Menaikkan revisi kalender dan mengirim job hitung ulang cache dalam transaksi `tx` (dipakai T42 saat kategori
 * efektif berubah). Cache yang ada menjadi "perlu dihitung ulang" sampai job selesai.
 */
export async function naikkanRevisiKalender(tx: Tx): Promise<number> {
  const [baris] = await tx
    .insert(revisiKalender)
    .values({ id: 1, revisi: 1 })
    .onConflictDoUpdate({
      target: revisiKalender.id,
      set: { revisi: sql`${revisiKalender.revisi} + 1`, diubahPada: sql`now()` },
    })
    .returning({ revisi: revisiKalender.revisi });
  await kirimJobHitungCacheLaporan(tx);
  return baris.revisi;
}

/**
 * Perubahan kategori yang berlaku untuk perhitungan (juga dipakai penelusuran angka, T37). Belum ada perubahan
 * kategori manual (T42), jadi kategori efektif saat ini selalu kategori dasar.
 */
export async function bacaPerubahanKategori(): Promise<PerubahanKategori[]> {
  return [];
}

/** Id versi cache yang dibaca: versi `selesai` terbaru, atau `null` bila belum ada. */
export async function idVersiCacheAktif(klien: Klien = db): Promise<number | null> {
  const [baris] = await klien
    .select({ id: versiCacheLaporan.id })
    .from(versiCacheLaporan)
    .where(eq(versiCacheLaporan.status, "selesai"))
    .orderBy(desc(versiCacheLaporan.selesaiPada), desc(versiCacheLaporan.id))
    .limit(1);
  return baris?.id ?? null;
}

export type StatusCacheLaporan = "terbaru" | "sedang-dihitung" | "perlu-dihitung-ulang" | "gagal";

/** Status cache terhadap kunci versi saat ini, atau `null` bila belum ada impor aktif. */
export async function muatStatusCacheLaporan(): Promise<StatusCacheLaporan | null> {
  const kunci = await bacaKunciVersi(db);
  if (kunci.imporAktif.length === 0) return null;

  const daftarVersi = await db.select().from(versiCacheLaporan).orderBy(desc(versiCacheLaporan.id));
  const idAktif = await idVersiCacheAktif();
  const aktif = daftarVersi.find((v) => v.id === idAktif);
  if (aktif && kunciSama(aktif, kunci)) return "terbaru";

  const terakhirSamaKunci = daftarVersi.find((v) => kunciSama(v, kunci));
  if (terakhirSamaKunci?.status === "sedang-dihitung") return "sedang-dihitung";
  if (terakhirSamaKunci?.status === "gagal") return "gagal";
  return "perlu-dihitung-ulang";
}

// --- Perhitungan (handler job worker) ---

type DataPasangan = {
  tokoId: number;
  kodeProduk: string;
  pengamatan: Pengamatan[];
  imporPerTanggal: Map<string, number>;
};

type BarisNilaiMingguan = typeof cacheNilaiMingguan.$inferInsert;
type BarisRataRataBulanan = typeof cacheRataRataBulanan.$inferInsert;
type BarisTotalPenjualanMentah = typeof cacheTotalPenjualanMentah.$inferInsert;

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

/** `F2` → `F`; `B14` → `14`. */
const hurufKolom = (alamat: string) => alamat.replace(/\d+$/, "");
const nomorBaris = (alamat: string) => /\d+$/.exec(alamat)?.[0] ?? "";

/**
 * Membangun pengamatan per pasangan produk–toko dari semua impor aktif (ADR-0002): setiap tanggal di cakupan
 * toko untuk produk yang barisnya ada di impor itu adalah pengamatan, berisi angka sel atau nol tersirat.
 * Tanggal di luar cakupan impor aktif tidak tersedia dan tidak dikirim.
 */
async function bacaPasangan(idImpor: number[]): Promise<Map<number, DataPasangan[]>> {
  if (idImpor.length === 0) return new Map();
  const daftarImpor = await db
    .select({ id: impor.id, namaSheet: impor.namaSheet, produk: impor.produk })
    .from(impor)
    .where(inArray(impor.id, idImpor));
  const cakupan = await db
    .select({
      imporId: cakupanTanggalImpor.imporId,
      tokoId: cakupanTanggalImpor.tokoId,
      tanggal: cakupanTanggalImpor.tanggal,
      alamatKolom: cakupanTanggalImpor.alamatKolom,
    })
    .from(cakupanTanggalImpor)
    .where(inArray(cakupanTanggalImpor.imporId, idImpor))
    .orderBy(asc(cakupanTanggalImpor.tanggal));
  const sel = await db
    .select({
      imporId: selPenjualan.imporId,
      tokoId: selPenjualan.tokoId,
      kodeProduk: selPenjualan.kodeProduk,
      tanggal: selPenjualan.tanggal,
      kuantitas: selPenjualan.kuantitas,
      alamat: selPenjualan.alamat,
    })
    .from(selPenjualan)
    .where(inArray(selPenjualan.imporId, idImpor));

  const kunciSel = (imporId: number, tokoId: number, kode: string, tanggal: string) =>
    `${imporId}|${tokoId}|${kode}|${tanggal}`;
  const selPerKunci = new Map(sel.map((s) => [kunciSel(s.imporId, s.tokoId, s.kodeProduk, s.tanggal), s]));
  const imporPerId = new Map(daftarImpor.map((i) => [i.id, i]));
  const tanggalBisnis = new Map<string, TanggalBisnis>();
  const keTanggalBisnis = (teks: string) => {
    let hasil = tanggalBisnis.get(teks);
    if (hasil === undefined) {
      hasil = parseTanggalBisnis(teks);
      tanggalBisnis.set(teks, hasil);
    }
    return hasil;
  };

  const pasanganPerToko = new Map<number, Map<string, DataPasangan>>();
  for (const kolom of cakupan) {
    const sumber = imporPerId.get(kolom.imporId);
    if (!sumber) continue;
    const perProduk = pasanganPerToko.get(kolom.tokoId) ?? new Map<string, DataPasangan>();
    pasanganPerToko.set(kolom.tokoId, perProduk);
    const tanggal = keTanggalBisnis(kolom.tanggal);
    for (const p of sumber.produk) {
      let pasangan = perProduk.get(p.kodeProduk);
      if (!pasangan) {
        pasangan = { tokoId: kolom.tokoId, kodeProduk: p.kodeProduk, pengamatan: [], imporPerTanggal: new Map() };
        perProduk.set(p.kodeProduk, pasangan);
      }
      const terisi = selPerKunci.get(kunciSel(kolom.imporId, kolom.tokoId, p.kodeProduk, kolom.tanggal));
      const alamat = terisi?.alamat ?? `${hurufKolom(kolom.alamatKolom)}${nomorBaris(p.alamat)}`;
      pasangan.pengamatan.push({ tanggal, qty: terisi?.kuantitas ?? 0, selSumber: `${sumber.namaSheet}!${alamat}` });
      pasangan.imporPerTanggal.set(kolom.tanggal, kolom.imporId);
    }
  }
  return new Map([...pasanganPerToko].map(([tokoId, perProduk]) => [tokoId, [...perProduk.values()]]));
}

function hitungPasangan(
  versiId: number,
  pasangan: DataPasangan,
  kategoriPadaTanggal: (tanggal: TanggalBisnis) => KategoriDasar,
) {
  const daftarBulan = [...new Set(pasangan.pengamatan.map((p) => posisiLaporan(p.tanggal).bulanLaporan))].sort();
  const mingguan: BarisNilaiMingguan[] = [];
  const bulanan: BarisRataRataBulanan[] = [];
  const mentah: BarisTotalPenjualanMentah[] = [];
  const identitas = { versiId, tokoId: pasangan.tokoId, kodeProduk: pasangan.kodeProduk };

  // hitungLaporan menerima 1–12 bulan; setiap bulan laporan dihitung terpisah, jadi pemotongan tidak mengubah hasil.
  for (const bulanPilihan of potong(daftarBulan, MAKS_BULAN_PER_HITUNG)) {
    const hasil = hitungLaporan({ pengamatan: pasangan.pengamatan, kategoriEfektif: kategoriPadaTanggal, bulanPilihan });
    for (const n of hasil.nilaiMingguan) {
      mingguan.push({
        ...identitas,
        bulanLaporan: n.bulanLaporan,
        mingguLaporan: n.mingguLaporan,
        kategori: n.kategori,
        tanggal: n.tanggal,
        selSumber: n.selSumber,
        imporId: n.tanggal.map((t) => pasangan.imporPerTanggal.get(t) ?? 0),
        tanggalTidakTeramati: n.tanggalTidakTeramati,
        jumlahQty: n.jumlahQty,
        pembagiTanggal: n.pembagiTanggal,
        nilaiMingguan: n.nilaiMingguan,
        kelengkapan: n.kelengkapan,
      });
    }
    for (const r of hasil.rataRataBulanan) {
      bulanan.push({
        ...identitas,
        bulanLaporan: r.bulanLaporan,
        kategori: r.kategori,
        jumlahNilaiMingguan: r.jumlahNilaiMingguan,
        pembagiMinggu: r.pembagiMinggu,
        rataRataBulanan: r.rataRataBulanan,
        kelengkapan: r.kelengkapan,
      });
    }
    for (const t of hasil.totalPenjualanMentah) {
      mentah.push({ ...identitas, bulanLaporan: t.bulanLaporan, totalPenjualanMentah: t.totalPenjualanMentah });
    }
  }
  return { mingguan, bulanan, mentah };
}

/**
 * Handler job `hitung-cache-laporan`. Membaca kunci versi saat mulai; bila cache yang dibaca sudah untuk kunci
 * itu, tidak ada yang dihitung. Versi baru ditulis dalam satu transaksi dan baru dibaca setelah `selesai`.
 * Bila gagal, versinya ditandai `gagal` dan cache sebelumnya tetap dibaca.
 */
export async function hitungUlangCacheLaporan(): Promise<void> {
  const kunci = await bacaKunciVersi(db);
  const idAktif = await idVersiCacheAktif();
  if (idAktif !== null) {
    const [aktif] = await db.select().from(versiCacheLaporan).where(eq(versiCacheLaporan.id, idAktif));
    if (aktif && kunciSama(aktif, kunci)) return;
  }

  const [versi] = await db
    .insert(versiCacheLaporan)
    .values({ imporAktif: kunci.imporAktif, revisiKalender: kunci.revisiKalender, status: "sedang-dihitung" })
    .returning({ id: versiCacheLaporan.id });

  try {
    const perubahan = await bacaPerubahanKategori();
    const pasanganPerToko = await bacaPasangan(kunci.imporAktif);
    await db.transaction(async (tx) => {
      for (const [tokoId, daftarPasangan] of pasanganPerToko) {
        const kategoriPerTanggal = new Map<TanggalBisnis, KategoriDasar>();
        const kategoriPadaTanggal = (tanggal: TanggalBisnis) => {
          let kategori = kategoriPerTanggal.get(tanggal);
          if (kategori === undefined) {
            kategori = kategoriEfektif(tanggal, String(tokoId), perubahan).kategoriEfektif;
            kategoriPerTanggal.set(tanggal, kategori);
          }
          return kategori;
        };
        const mingguan: BarisNilaiMingguan[] = [];
        const bulanan: BarisRataRataBulanan[] = [];
        const mentah: BarisTotalPenjualanMentah[] = [];
        for (const pasangan of daftarPasangan) {
          const hasil = hitungPasangan(versi.id, pasangan, kategoriPadaTanggal);
          mingguan.push(...hasil.mingguan);
          bulanan.push(...hasil.bulanan);
          mentah.push(...hasil.mentah);
        }
        for (const batch of potong(mingguan, UKURAN_BATCH)) await tx.insert(cacheNilaiMingguan).values(batch);
        for (const batch of potong(bulanan, UKURAN_BATCH)) await tx.insert(cacheRataRataBulanan).values(batch);
        for (const batch of potong(mentah, UKURAN_BATCH)) await tx.insert(cacheTotalPenjualanMentah).values(batch);
      }
      await tx
        .update(versiCacheLaporan)
        .set({ status: "selesai", selesaiPada: sql`now()`, pesanGagal: null })
        .where(eq(versiCacheLaporan.id, versi.id));
      // Versi sebelumnya (beserta cache-nya) tidak lagi dibaca setelah versi ini selesai.
      await tx.delete(versiCacheLaporan).where(lt(versiCacheLaporan.id, versi.id));
    });
  } catch (galat) {
    console.error(`[hitung-cache-laporan] versi ${versi.id}:`, galat);
    await db
      .update(versiCacheLaporan)
      .set({ status: "gagal", pesanGagal: galat instanceof Error ? galat.message : String(galat), selesaiPada: sql`now()` })
      .where(eq(versiCacheLaporan.id, versi.id));
  }
}
