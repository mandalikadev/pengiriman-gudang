import { CalendarClock } from "lucide-react";
import type { ReactNode } from "react";

import { TabelRiwayatPengiriman } from "@/app/usulan-jadwal/tampilan-pengiriman";
import { cocokCari, NavigasiHalaman, nomorHalaman, potongHalaman, teksParameter, urlDaftar, type ParameterUrl } from "@/components/daftar-berhalaman";
import { KeadaanKosong } from "@/components/keadaan-kosong";
import { parseTanggalBisnis } from "@/domain/kalender";
import { daftarRiwayatPengirimanDiLuarJadwal, pilihanFilterPengirimanDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";

import { FilterRiwayat } from "./filter-riwayat";
import { nilaiFilter, nilaiTanggal, SEMUA } from "./filter";

/**
 * Tab "Di luar jadwal" halaman Riwayat (T128; PRD A5 ▶ Revisi 2026-10-14, A7 ▶ Keputusan 2026-10-14). Hanya-baca: semua
 * pengiriman di luar jadwal semua gudang dan semua status, terbaru di atas, dengan isian catatan aktivitas PRD A5 dan
 * kolom Gudang (gudang nonaktif diberi penanda). Tarik dan Batalkan tetap di halaman kerja. Filter `?gudang=<id>`,
 * `?toko=<id>`, rentang tanggal kirim `?dari=`/`?sampai=` (YYYY-MM-DD), cari nama toko `?cari=`, dan halaman 50 baris
 * `?halaman=` (DESIGN §11.1), semuanya bersama `?tab=`. Kewenangan lihat diperiksa halaman (`wajibMasuk`).
 */
export async function isiTabDiLuarJadwal({
  parameter,
  urlHalaman,
  tab,
}: {
  parameter: ParameterUrl;
  urlHalaman: string;
  tab: string;
}): Promise<ReactNode> {
  const pilihan = await pilihanFilterPengirimanDiLuarJadwal();
  if (!pilihan.adaPengiriman) {
    return (
      <KeadaanKosong
        ikon={CalendarClock}
        judul="Belum ada pengiriman di luar jadwal."
        langkah="Pengiriman di luar jadwal muncul di sini setelah operator mengusulkannya dari Kirim di luar jadwal."
      />
    );
  }
  const terapan = {
    gudang: nilaiFilter(
      parameter.gudang,
      pilihan.gudang.map((g) => String(g.id)),
    ),
    toko: nilaiFilter(
      parameter.toko,
      pilihan.toko.map((t) => String(t.id)),
    ),
    dari: nilaiTanggal(parameter.dari),
    sampai: nilaiTanggal(parameter.sampai),
  };
  const cari = teksParameter(parameter.cari);
  const semua = await daftarRiwayatPengirimanDiLuarJadwal({
    idGudang: terapan.gudang === SEMUA ? undefined : Number(terapan.gudang),
    tokoId: terapan.toko === SEMUA ? undefined : Number(terapan.toko),
    dari: terapan.dari === "" ? undefined : parseTanggalBisnis(terapan.dari),
    sampai: terapan.sampai === "" ? undefined : parseTanggalBisnis(terapan.sampai),
  });
  const daftar = potongHalaman(
    semua.filter((e) => cocokCari(cari, e.toko)),
    nomorHalaman(parameter.halaman),
  );
  const keadaanUrl = {
    tab,
    gudang: terapan.gudang === SEMUA ? undefined : terapan.gudang,
    toko: terapan.toko === SEMUA ? undefined : terapan.toko,
    dari: terapan.dari,
    sampai: terapan.sampai,
    cari,
  };

  return (
    <>
      <p className="text-muted-foreground">
        Catatan pengiriman di luar jadwal semua gudang dan semua status, terbaru di atas. Daftar ini hanya untuk dibaca.
      </p>
      <FilterRiwayat action={urlHalaman} tab={tab} gudang={pilihan.gudang} toko={pilihan.toko} terapan={{ ...terapan, cari }} />
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
