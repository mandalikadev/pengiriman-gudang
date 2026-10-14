import { CalendarRange, TriangleAlert } from "lucide-react";

import { formatBulanLaporan, formatWaktu } from "@/app/admin/impor/format";
import { Badge } from "@/components/ui/badge";
import type { PeriodeSumberPerhitungan } from "@/server/gudang/periode-sumber";

import { KartuLipat } from "./kartu-lipat";

/**
 * Ringkasan periode sumber di kepala halaman Pengiriman Gudang (DESIGN §11.5, T118): bulan yang dipakai, atau peringatan
 * (ikon + teks, DESIGN §7) bila belum ditetapkan atau ada bulan tanpa data aktif. Rinciannya di kartu Periode sumber.
 */
export function RingkasanPeriodeSumber({ periode }: { periode: PeriodeSumberPerhitungan | null }) {
  if (periode === null) {
    return (
      <p data-ringkasan-periode-sumber className="flex items-start gap-2 font-semibold">
        <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
        Periode sumber belum ditetapkan admin
      </p>
    );
  }
  return (
    <div data-ringkasan-periode-sumber className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex items-start gap-2">
        <CalendarRange aria-hidden strokeWidth={2} className="size-5 shrink-0 text-primary" />
        <span>
          Periode sumber:{" "}
          <span className="font-semibold">
            {periode.bulanDipakai.length > 0 ? periode.bulanDipakai.map(formatBulanLaporan).join(", ") : "—"}
          </span>
        </span>
      </p>
      {periode.bulanHilang.length > 0 ? (
        <p className="flex items-start gap-2 font-semibold">
          <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
          {periode.bulanHilang.length} bulan tanpa data aktif
        </p>
      ) : null}
    </div>
  );
}

/**
 * Kartu Periode sumber penjualan (T51, PRD A4, ADR-0003): hanya-baca, terpisah dari pilihan bulan Ringkasan,
 * menampilkan siapa dan kapan admin menetapkannya. Belum ditetapkan → pesan peringatan, tanpa periode cadangan.
 * Bulan tanpa data aktif ditandai ikon + teks (DESIGN §7), terpisah dari bulan yang dipakai (PRD A4 ▶ 2026-10-10, T51).
 * T118 (DESIGN §11.5): bagian terakhir halaman, bisa dibuka-tutup dan awalnya tertutup.
 */
export function KartuPeriodeSumber({ periode }: { periode: PeriodeSumberPerhitungan | null }) {
  return (
    <KartuLipat
      idJudul="periode-sumber-judul"
      judul="Periode sumber penjualan"
      Ikon={CalendarRange}
      deskripsi="Bulan laporan yang menjadi dasar rata-rata pengiriman gudang ini. Ditetapkan admin dan terpisah dari pilihan bulan di Ringkasan."
      data-periode-sumber
    >
      {periode === null ? (
        <p data-status="periodeBelumDitetapkan" className="flex items-start gap-2 font-semibold">
          <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
          Periode sumber belum ditetapkan admin
        </p>
      ) : (
        <>
          {periode.bulanDipakai.length > 0 ? (
            <ul aria-label="Bulan periode sumber yang dipakai" className="flex flex-wrap gap-2">
              {periode.bulanDipakai.map((kode) => (
                <li
                  key={kode}
                  data-bulan={kode}
                  className="rounded-full bg-accent px-3 py-1 font-semibold text-accent-foreground"
                >
                  {formatBulanLaporan(kode)}
                </li>
              ))}
            </ul>
          ) : null}
          {periode.bulanHilang.length > 0 ? (
            <>
              <ul aria-label="Bulan periode sumber tanpa data aktif" className="flex flex-wrap gap-2">
                {periode.bulanHilang.map((kode) => (
                  <li key={kode} data-bulan-hilang={kode}>
                    <Badge variant="warning">
                      <TriangleAlert aria-hidden strokeWidth={2} className="size-5" />
                      {formatBulanLaporan(kode)} — Tidak ada data aktif
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                {periode.bulanDipakai.length > 0
                  ? "Perhitungan memakai bulan yang masih punya data aktif."
                  : "Tidak ada bulan di periode ini yang masih punya data aktif."}
              </p>
            </>
          ) : null}
          <p className="text-muted-foreground">
            Ditetapkan oleh <span className="font-semibold text-foreground">{periode.ditetapkanOleh}</span> pada{" "}
            {formatWaktu(periode.ditetapkanPada)}.
          </p>
        </>
      )}
    </KartuLipat>
  );
}
