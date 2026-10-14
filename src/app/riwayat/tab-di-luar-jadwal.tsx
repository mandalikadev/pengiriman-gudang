import { CalendarClock } from "lucide-react";
import type { ReactNode } from "react";

import { TabelRiwayatPengiriman } from "@/app/usulan-jadwal/tampilan-pengiriman";
import { NavigasiHalaman, nomorHalaman, potongHalaman, urlDaftar, type ParameterUrl } from "@/components/daftar-berhalaman";
import { KeadaanKosong } from "@/components/keadaan-kosong";

import { EksporRiwayat } from "./ekspor-riwayat";
import { FilterRiwayat } from "./filter-riwayat";
import { hasilFilterDiLuarJadwal, parameterTerapan } from "./hasil-filter";
import type { CakupanEksporRiwayat } from "./muat";

/**
 * Tab "Di luar jadwal" halaman Riwayat (T128; PRD A5 ▶ Revisi 2026-10-14, A7 ▶ Keputusan 2026-10-14). Hanya-baca: semua
 * pengiriman di luar jadwal semua gudang dan semua status, terbaru di atas, dengan isian catatan aktivitas PRD A5 dan
 * kolom Gudang (gudang nonaktif diberi penanda). Tarik dan Batalkan tetap di halaman kerja. Filter `?gudang=<id>`,
 * `?toko=<id>`, rentang tanggal kirim `?dari=`/`?sampai=` (YYYY-MM-DD), cari nama toko `?cari=`, dan halaman 50 baris
 * `?halaman=` (DESIGN §11.1), semuanya bersama `?tab=`. Ekspor seluruh hasil filter sesuai `cakupanEkspor` (T129).
 * Kewenangan lihat diperiksa halaman (`wajibMasuk`).
 */
export async function isiTabDiLuarJadwal({
  cakupanEkspor,
  parameter,
  urlHalaman,
  tab,
}: {
  cakupanEkspor: CakupanEksporRiwayat | null;
  parameter: ParameterUrl;
  urlHalaman: string;
  tab: string;
}): Promise<ReactNode> {
  const filter = await hasilFilterDiLuarJadwal(parameter);
  if (filter === null) {
    return (
      <KeadaanKosong
        ikon={CalendarClock}
        judul="Belum ada pengiriman di luar jadwal."
        langkah="Pengiriman di luar jadwal muncul di sini setelah operator mengusulkannya dari Kirim di luar jadwal."
      />
    );
  }
  const { pilihan, terapan, hasil } = filter;
  const daftar = potongHalaman(hasil, nomorHalaman(parameter.halaman));
  const keadaanUrl = parameterTerapan(terapan, tab);

  return (
    <>
      <p className="text-muted-foreground">
        Catatan pengiriman di luar jadwal semua gudang dan semua status, terbaru di atas. Daftar ini hanya untuk dibaca.
      </p>
      <FilterRiwayat action={urlHalaman} tab={tab} gudang={pilihan.gudang} toko={pilihan.toko} terapan={terapan} />
      <EksporRiwayat cakupan={cakupanEkspor} parameter={keadaanUrl} idGudangHasil={hasil.map((e) => e.idGudang)} pilihanGudang={pilihan.gudang} />
      <TabelRiwayatPengiriman
        label="Riwayat pengiriman di luar jadwal"
        daftar={daftar.baris}
        tampilkanGudang
        tandaiGudangNonaktif
        kosong="Tidak ada pengiriman di luar jadwal yang cocok dengan filter ini."
      />
      <NavigasiHalaman
        potongan={daftar}
        label="Halaman riwayat pengiriman di luar jadwal"
        url={(halaman) => urlDaftar(urlHalaman, keadaanUrl, { halaman })}
      />
    </>
  );
}
