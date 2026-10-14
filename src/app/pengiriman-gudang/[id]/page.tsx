import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { tanggalWib } from "@/app/admin/impor/format";
import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { AksesDitolakError, wajibAksesLihatGudang } from "@/server/auth/kewenangan";
import { gudangLangsungMasuk } from "@/server/gudang/akses";
import { bacaRingkasanDraft, daftarTanggalDraft } from "@/server/gudang/draft-rencana";
import { jadwalTokoGudang } from "@/server/gudang/jadwal";
import { bacaPeriodeSumberPerhitungan } from "@/server/gudang/periode-sumber";
import { pengirimanAkanDatangPerToko } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { saranTanggalKirim, tanggalKirimTerdekat } from "@/server/gudang/tanggal-kirim-terdekat";

import { BadgeGudangNonaktif, KeteranganHanyaBaca } from "../hanya-baca";
import { BagianDraft } from "./bagian-draft";
import { BagianJadwal } from "./bagian-jadwal";
import { KartuPeriodeSumber, RingkasanPeriodeSumber } from "./kartu-periode-sumber";

export const metadata: Metadata = {
  title: "Pengiriman Gudang — Dashboard Penjualan MANDALIKA",
};

/**
 * Akses lihat diperiksa di server sebelum membaca data; tanpa akses atau id tidak dikenal mendapat 404. `adaDaftarGudang`
 * = pengguna melihat daftar gudang (bukan operator yang langsung masuk ke satu-satunya gudangnya, T118).
 */
async function muatGudang(id: string) {
  if (!/^\d{1,9}$/.test(id)) notFound();
  try {
    const { pengguna, gudang, daftarGudang } = await wajibAksesLihatGudang(Number(id));
    return { gudang, adaDaftarGudang: gudangLangsungMasuk(pengguna, daftarGudang) === null };
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
}

/** `?tanggal=YYYY-MM-DD` = draft yang dibuka; nilai lain diabaikan (tanggal kirim terdekat yang dibuka). */
function bacaTanggalDiminta(nilai: string | string[] | undefined): TanggalBisnis | null {
  if (typeof nilai !== "string") return null;
  try {
    return parseTanggalBisnis(nilai);
  } catch {
    return null;
  }
}

/** `?toko=<id toko>` = toko draft yang dibuka (T73); nilai lain diabaikan (tidak ada toko dibuka). */
function bacaTokoDiminta(nilai: string | string[] | undefined): number | null {
  return typeof nilai === "string" && /^\d{1,9}$/.test(nilai) ? Number(nilai) : null;
}

/**
 * Zona kerja (DESIGN §1). Halaman Pengiriman Gudang satu gudang (T50) dengan kartu Periode sumber (T51) dan bagian
 * Jadwal (T55): jadwal tetap ditambah pengiriman di luar jadwal yang akan datang (T113). Operator dengan hak
 * `kelola-usulan-jadwal` mendapat tautan "Kirim di luar jadwal" (PRD A5 ▶ Revisi 2026-10-13). Bagian Draft rencana (T58)
 * menampilkan draft yang tersimpan tanpa menghitung saat halaman dibuka (PRD C1), sebagai ringkasan per toko; `?toko=<id>`
 * membuka baris satu toko (T73) dan `?rincian=<id toko>|<kode produk>` membuka rincian perhitungan satu barisnya (T60). Operator dengan hak `finalisasi` memfinalisasi rencana per toko (T62).
 * Tautan Riwayat rencana final (T63) untuk semua yang bisa melihat halaman ini.
 *
 * T118 (DESIGN §11.5): urutan isi = kepala (gudang dan ringkasan periode sumber), Draft rencana, Jadwal toko (dengan status
 * toko; tabel "Toko terhubung" dihapus), lalu Periode sumber lengkap; dua bagian terakhir awalnya tertutup. Tanpa
 * `?tanggal`, draft yang dibuka adalah tanggal kirim terdekat (hari ini atau sesudahnya); tanpa tanggal kirim terdekat
 * (tidak ada toko aktif berjadwal), draft terakhir dihitung seperti sebelumnya.
 */
export default async function HalamanPengirimanGudang({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gudang, adaDaftarGudang } = await muatGudang((await params).id);
  const parameter = await searchParams;
  const tanggalDiminta = bacaTanggalDiminta(parameter?.tanggal);
  const hariIni = tanggalWib(new Date());
  const [periodeSumber, daftarJadwal, diLuarJadwalPerToko, daftarTanggal, terdekat, saranTanggal] = await Promise.all([
    bacaPeriodeSumberPerhitungan(gudang.id),
    jadwalTokoGudang(gudang.id),
    pengirimanAkanDatangPerToko(gudang.id, hariIni),
    daftarTanggalDraft(gudang.id),
    tanggalKirimTerdekat(gudang.id, hariIni),
    saranTanggalKirim(gudang.id, hariIni),
  ]);
  const tanggalDibuka = tanggalDiminta ?? terdekat?.tanggalKirim ?? null;
  const draft = await bacaRingkasanDraft(gudang.id, tanggalDibuka ?? undefined, bacaTokoDiminta(parameter?.toko));
  const tanggalTerdekat = terdekat?.tanggalKirim ?? null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <header className="flex flex-col gap-3">
        {adaDaftarGudang ? (
          <Link
            href="/pengiriman-gudang"
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
            Daftar gudang
          </Link>
        ) : null}
        <h1 className="text-2xl font-bold md:text-3xl">Pengiriman Gudang — {gudang.nama}</h1>
        {gudang.aktif ? null : <BadgeGudangNonaktif />}
        <RingkasanPeriodeSumber periode={periodeSumber} />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/pengiriman-gudang/${gudang.id}/rencana-final`}
            data-tautan-riwayat-final
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary underline underline-offset-4 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Riwayat rencana final
          </Link>
        </div>
        {gudang.hakTindakan.length === 0 ? (
          <KeteranganHanyaBaca>
            Hanya-baca: Anda bisa melihat halaman ini, tetapi tidak punya hak tindakan di gudang ini.
          </KeteranganHanyaBaca>
        ) : null}
      </header>

      <BagianDraft
        idGudang={gudang.id}
        bolehHitung={gudang.hakTindakan.includes("hitung-kebutuhan")}
        bolehInputStok={gudang.hakTindakan.includes("input-stok")}
        bolehFinalisasi={gudang.hakTindakan.includes("finalisasi")}
        daftarTanggal={daftarTanggal}
        tanggalDiminta={tanggalDibuka}
        tanggalTerdekat={tanggalTerdekat}
        hariIni={hariIni}
        saranTanggal={saranTanggal}
        draft={draft}
        rincianDiminta={typeof parameter?.rincian === "string" ? parameter.rincian : null}
        tokoNonaktifBerjadwal={daftarJadwal.filter((t) => !t.aktif && t.jadwal !== null)}
      />

      {/* Tautan "Kirim di luar jadwal" (T113) hanya untuk pengguna dengan hak kelola-usulan-jadwal di gudang ini. */}
      <BagianJadwal
        idGudang={gudang.id}
        daftarToko={daftarJadwal}
        diLuarJadwalPerToko={diLuarJadwalPerToko}
        tautan={gudang.hakTindakan.includes("kelola-usulan-jadwal")}
      />

      <KartuPeriodeSumber periode={periodeSumber} />
    </main>
  );
}
