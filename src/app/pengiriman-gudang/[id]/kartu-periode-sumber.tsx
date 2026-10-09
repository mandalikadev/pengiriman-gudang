import { CalendarRange, TriangleAlert } from "lucide-react";

import { formatBulanLaporan, formatWaktu } from "@/app/admin/impor/format";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { PeriodeSumber } from "@/server/gudang/periode-sumber";

/**
 * Kartu Periode sumber penjualan (T51, PRD A4, ADR-0003): hanya-baca, terpisah dari pilihan bulan Ringkasan,
 * menampilkan siapa dan kapan admin menetapkannya. Belum ditetapkan → pesan peringatan, tanpa periode cadangan.
 */
export function KartuPeriodeSumber({ periode }: { periode: PeriodeSumber | null }) {
  return (
    <Card role="region" aria-labelledby="periode-sumber-judul" data-periode-sumber>
      <CardHeader>
        <h2 id="periode-sumber-judul" className="flex items-center gap-3 text-xl font-semibold">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarRange strokeWidth={2} className="size-5" />
          </span>
          Periode sumber penjualan
        </h2>
        <CardDescription>
          Bulan laporan yang menjadi dasar rata-rata pengiriman gudang ini. Ditetapkan admin dan terpisah dari pilihan
          bulan di Ringkasan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {periode === null ? (
          <p data-status="periodeBelumDitetapkan" className="flex items-start gap-2 font-semibold">
            <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
            Periode sumber belum ditetapkan admin
          </p>
        ) : (
          <>
            <ul aria-label="Bulan periode sumber" className="flex flex-wrap gap-2">
              {periode.bulan.map((kode) => (
                <li
                  key={kode}
                  data-bulan={kode}
                  className="rounded-full bg-accent px-3 py-1 font-semibold text-accent-foreground"
                >
                  {formatBulanLaporan(kode)}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Ditetapkan oleh <span className="font-semibold text-foreground">{periode.ditetapkanOleh}</span> pada{" "}
              {formatWaktu(periode.ditetapkanPada)}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
