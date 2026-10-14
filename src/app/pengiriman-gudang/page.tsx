import { CalendarClock, ChevronRight, CircleCheck, ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatAngka, tanggalWib } from "@/app/admin/impor/format";
import { formatTanggal } from "@/domain/kalender";
import { AksesDitolakError, wajibAksesPengirimanGudang } from "@/server/auth/kewenangan";
import { gudangLangsungMasuk } from "@/server/gudang/akses";
import { tanggalKirimTerdekat, type TanggalKirimTerdekat } from "@/server/gudang/tanggal-kirim-terdekat";

import { BadgeGudangNonaktif, KeteranganHanyaBaca } from "./hanya-baca";

export const metadata: Metadata = {
  title: "Pengiriman Gudang — Dashboard Penjualan MANDALIKA",
};

/** Tanggal kirim terdekat gudang dan jumlah toko yang belum final untuk tanggal itu (DESIGN §11.5; ikon + teks, §7). */
function RingkasanTerdekat({ terdekat }: { terdekat: TanggalKirimTerdekat | null }) {
  if (terdekat === null) {
    return <span className="text-muted-foreground">Belum ada tanggal kirim terdekat</span>;
  }
  const semuaFinal = terdekat.jumlahBelumFinal === 0;
  const Ikon = semuaFinal ? CircleCheck : ClipboardList;
  return (
    <>
      <span data-tanggal-kirim-terdekat={terdekat.tanggalKirim} className="flex items-center gap-2">
        <CalendarClock aria-hidden strokeWidth={2} className="size-5 shrink-0 text-primary" />
        Kirim terdekat {formatTanggal(terdekat.tanggalKirim)}
      </span>
      <span data-jumlah-belum-final={terdekat.jumlahBelumFinal} className="flex items-center gap-2">
        <Ikon aria-hidden strokeWidth={2} className={semuaFinal ? "size-5 shrink-0 text-success" : "size-5 shrink-0 text-primary"} />
        {semuaFinal ? "Semua toko sudah final" : `${formatAngka(terdekat.jumlahBelumFinal)} toko belum final`}
      </span>
    </>
  );
}

/**
 * Zona kerja (DESIGN §1). Daftar gudang yang bisa diakses pengguna; tanpa akses mendapat 404. Gudang nonaktif hanya
 * tampil untuk admin, dengan badge Nonaktif (T110). Operator dengan tepat satu gudang langsung masuk ke gudang itu;
 * kartu gudang menampilkan tanggal kirim terdekat dan jumlah toko yang belum final untuk tanggal itu (T118, DESIGN §11.5).
 */
export default async function HalamanDaftarPengirimanGudang() {
  let pengguna;
  let daftarGudang;
  try {
    ({ pengguna, daftarGudang } = await wajibAksesPengirimanGudang());
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const langsung = gudangLangsungMasuk(pengguna, daftarGudang);
  if (langsung !== null) redirect(`/pengiriman-gudang/${langsung.id}`);
  const hariIni = tanggalWib(new Date());
  const terdekat = await Promise.all(daftarGudang.map((g) => tanggalKirimTerdekat(g.id, hariIni)));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Pengiriman Gudang</h1>
      <ul aria-label="Gudang" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {daftarGudang.map((g, i) => (
          <li key={g.id}>
            <Link
              href={`/pengiriman-gudang/${g.id}`}
              data-id-gudang={g.id}
              className="flex min-h-11 flex-col gap-2 rounded-3xl border border-border/60 bg-card p-6 shadow-soft transition-colors duration-300 ease-out outline-none hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex items-center justify-between gap-2 text-base font-semibold text-primary">
                {g.nama}
                <ChevronRight aria-hidden strokeWidth={2} className="size-5 shrink-0" />
              </span>
              {g.aktif ? null : <BadgeGudangNonaktif />}
              {g.hakTindakan.length === 0 ? <KeteranganHanyaBaca>Hanya-baca</KeteranganHanyaBaca> : null}
              <RingkasanTerdekat terdekat={terdekat[i]} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
