import { and, asc, desc, eq, inArray, max, min, ne, sql } from "drizzle-orm";

import { klasifikasiProduk } from "@/domain/produk";
import { db } from "@/server/db";
import { cakupanTanggalImpor, impor, produk, selPenjualan, toko, user } from "@/server/db/schema";

import { alasanTidakBisaAktif } from "./impor";

// Data halaman daftar dan tinjau impor (issue T11). Pemeriksaan peran ada di halaman.

export async function muatDaftarImpor() {
  return db
    .select({
      id: impor.id,
      namaFile: impor.namaFile,
      namaSheet: impor.namaSheet,
      tahunImpor: impor.tahunImpor,
      bulanImpor: impor.bulanImpor,
      status: impor.status,
      diunggahPada: impor.diunggahPada,
      diunggahOleh: user.name,
    })
    .from(impor)
    .innerJoin(user, eq(user.id, impor.diunggahOleh))
    .orderBy(desc(impor.diunggahPada), desc(impor.id));
}

async function ringkasanPerToko(idImpor: number) {
  const cakupan = await db
    .select({
      idToko: toko.id,
      namaToko: toko.nama,
      tokoAktif: toko.aktif,
      tanggalAwal: min(cakupanTanggalImpor.tanggal),
      tanggalAkhir: max(cakupanTanggalImpor.tanggal),
      jumlahTanggal: sql<number>`count(*)::int`,
    })
    .from(cakupanTanggalImpor)
    .innerJoin(toko, eq(toko.id, cakupanTanggalImpor.tokoId))
    .where(eq(cakupanTanggalImpor.imporId, idImpor))
    .groupBy(toko.id, toko.nama, toko.aktif)
    .orderBy(asc(min(cakupanTanggalImpor.id)));
  const sel = await db
    .select({
      idToko: selPenjualan.tokoId,
      jumlahSel: sql<number>`count(*)::int`,
      totalPenjualanMentah: sql<number>`coalesce(sum(${selPenjualan.kuantitas}), 0)::int`,
    })
    .from(selPenjualan)
    .where(eq(selPenjualan.imporId, idImpor))
    .groupBy(selPenjualan.tokoId);
  const selPerToko = new Map(sel.map((s) => [s.idToko, s]));
  return cakupan.map((c) => ({
    namaToko: c.namaToko,
    /** Status toko di master saat ini (PRD A1, Keputusan 2026-10-09: toko nonaktif diberi penanda). */
    tokoNonaktif: !c.tokoAktif,
    tanggalAwal: c.tanggalAwal,
    tanggalAkhir: c.tanggalAkhir,
    jumlahTanggal: c.jumlahTanggal,
    jumlahSel: selPerToko.get(c.idToko)?.jumlahSel ?? 0,
    totalPenjualanMentah: selPerToko.get(c.idToko)?.totalPenjualanMentah ?? 0,
  }));
}

type KlasifikasiProduk = ReturnType<typeof klasifikasiProduk>;

function klasifikasiTersimpan(p: typeof produk.$inferSelect): KlasifikasiProduk {
  return p.klasifikasi === "manual" && p.alasanManual
    ? { klasifikasi: "manual", alasan: p.alasanManual }
    : { klasifikasi: "otomatis" };
}

type ProdukBaru = { kode: string; nama: string; ukuran: string; kategori: string; klasifikasi: KlasifikasiProduk };

async function produkBaru(data: typeof impor.$inferSelect): Promise<ProdukBaru[]> {
  if (data.status === "aktif" || data.status === "diarsipkan") {
    const baris = await db
      .select()
      .from(produk)
      .where(eq(produk.didaftarkanOlehImporId, data.id))
      .orderBy(asc(produk.kode));
    return baris.map((p) => ({
      kode: p.kode,
      nama: p.nama,
      ukuran: p.ukuran,
      kategori: p.kategori,
      klasifikasi: klasifikasiTersimpan(p),
    }));
  }
  if (data.produk.length === 0) return [];
  const kode = [...new Set(data.produk.map((p) => p.kodeProduk))];
  const terdaftar = await db.select({ kode: produk.kode }).from(produk).where(inArray(produk.kode, kode));
  const sudahAda = new Set(terdaftar.map((p) => p.kode));
  const terlihat = new Set<string>();
  return data.produk.flatMap((p) => {
    if (sudahAda.has(p.kodeProduk) || terlihat.has(p.kodeProduk)) return [];
    terlihat.add(p.kodeProduk);
    return [
      {
        kode: p.kodeProduk,
        nama: p.namaProduk,
        ukuran: p.ukuran,
        kategori: p.kategoriProduk,
        klasifikasi: klasifikasiProduk(p.kodeProduk, p.kategoriProduk),
      },
    ];
  });
}

type PerubahanProduk = {
  kode: string;
  perubahan: { kolom: "nama" | "ukuran" | "kategori"; lama: string; baru: string }[];
  /** Diisi hanya jika klasifikasi hasil hitung ulang berbeda dari master. */
  klasifikasi: { lama: KlasifikasiProduk; baru: KlasifikasiProduk } | null;
};

function samaKlasifikasi(a: KlasifikasiProduk, b: KlasifikasiProduk) {
  return a.klasifikasi === b.klasifikasi && (a.klasifikasi === "otomatis" || (b.klasifikasi === "manual" && a.alasan === b.alasan));
}

/**
 * "Data produk berubah" (PRD A1, Keputusan 2026-10-09): kode produk di impor yang nama, ukuran, atau kategorinya
 * berbeda dari master. Hanya sebelum aktivasi; setelah aktif atau diarsipkan, master tidak lagi dibandingkan.
 */
async function perubahanProduk(data: typeof impor.$inferSelect): Promise<PerubahanProduk[]> {
  if (data.status === "aktif" || data.status === "diarsipkan" || data.produk.length === 0) return [];
  const kode = [...new Set(data.produk.map((p) => p.kodeProduk))];
  const master = new Map(
    (await db.select().from(produk).where(inArray(produk.kode, kode))).map((p) => [p.kode, p]),
  );
  const terlihat = new Set<string>();
  return data.produk.flatMap((p) => {
    const lama = master.get(p.kodeProduk);
    if (!lama || terlihat.has(p.kodeProduk)) return [];
    terlihat.add(p.kodeProduk);
    const perubahan = (
      [
        { kolom: "nama", lama: lama.nama, baru: p.namaProduk },
        { kolom: "ukuran", lama: lama.ukuran, baru: p.ukuran },
        { kolom: "kategori", lama: lama.kategori, baru: p.kategoriProduk },
      ] as const
    ).filter((k) => k.lama !== k.baru);
    if (perubahan.length === 0) return [];
    const klasifikasiLama = klasifikasiTersimpan(lama);
    const klasifikasiBaru = klasifikasiProduk(p.kodeProduk, p.kategoriProduk);
    return [
      {
        kode: p.kodeProduk,
        perubahan: [...perubahan],
        klasifikasi: samaKlasifikasi(klasifikasiLama, klasifikasiBaru) ? null : { lama: klasifikasiLama, baru: klasifikasiBaru },
      },
    ];
  });
}

/** Semua yang ditampilkan halaman tinjau satu impor, atau `null` jika impor tidak ada. */
export async function muatTinjauImpor(idImpor: number) {
  const [data] = await db.select().from(impor).where(eq(impor.id, idImpor));
  if (!data) return null;
  const idPelaku = [data.diunggahOleh, ...(data.diaktifkanOleh ? [data.diaktifkanOleh] : [])];
  const pelaku = await db.select({ id: user.id, nama: user.name }).from(user).where(inArray(user.id, idPelaku));
  const namaPelaku = new Map(pelaku.map((p) => [p.id, p.nama]));

  const imporAktifLain = await db
    .select({ id: impor.id, namaFile: impor.namaFile, namaSheet: impor.namaSheet })
    .from(impor)
    .where(
      and(
        eq(impor.tahunImpor, data.tahunImpor),
        eq(impor.bulanImpor, data.bulanImpor),
        eq(impor.status, "aktif"),
        ne(impor.id, data.id),
      ),
    );

  const jumlahError = data.masalah.filter((m) => m.tingkat === "error").length;
  return {
    id: data.id,
    namaFile: data.namaFile,
    namaSheet: data.namaSheet,
    ukuranByte: data.ukuranByte,
    sha256: data.sha256,
    tahunImpor: data.tahunImpor,
    bulanImpor: data.bulanImpor,
    status: data.status,
    pesanGagal: data.pesanGagal,
    diunggahOleh: namaPelaku.get(data.diunggahOleh) ?? "—",
    diunggahPada: data.diunggahPada,
    diaktifkanOleh: data.diaktifkanOleh ? (namaPelaku.get(data.diaktifkanOleh) ?? "—") : null,
    diaktifkanPada: data.diaktifkanPada,
    diarsipkanPada: data.diarsipkanPada,
    masalah: data.masalah,
    jumlahError,
    jumlahPeringatan: data.masalah.length - jumlahError,
    alasanTidakBisaAktif: alasanTidakBisaAktif({ status: data.status, jumlahError }),
    imporAktifLain: imporAktifLain[0] ?? null,
    ringkasanPerToko: await ringkasanPerToko(data.id),
    produkBaru: await produkBaru(data),
    perubahanProduk: await perubahanProduk(data),
  };
}

export type DataTinjauImpor = NonNullable<Awaited<ReturnType<typeof muatTinjauImpor>>>;
