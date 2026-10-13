import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { KeteranganDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";

import { labelDiLuarJadwal, teksPenyetuju } from "./teks-di-luar-jadwal";

/**
 * Penanda toko yang dikirim di luar jadwal (T114, PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas) beserta alasan dan
 * penyetujunya: draft (ringkasan per toko dan toko yang dibuka), rencana final, rinciannya, dan riwayat. Ikon + teks
 * (DESIGN §7) dengan token dan ikon yang sudah ada: badge nada `default` (primary) dan `CalendarClock`. `terpilih` = di
 * baris terpilih berlatar accent: teks sekunder memakai accent-foreground (DESIGN §2).
 */
export function PenandaDiLuarJadwal({ keterangan, terpilih = false }: { keterangan: KeteranganDiLuarJadwal | null; terpilih?: boolean }) {
  if (keterangan === null) return null;
  const penyetuju = teksPenyetuju(keterangan);
  return (
    <div data-di-luar-jadwal={keterangan.jenis} className="flex flex-col gap-1 whitespace-normal">
      <Badge variant="default">
        <CalendarClock aria-hidden strokeWidth={2} className="size-5" />
        {labelDiLuarJadwal(keterangan)}
      </Badge>
      <span className={cn(terpilih ? "text-accent-foreground" : "text-muted-foreground")}>
        {`Alasan: ${keterangan.alasan} · ${penyetuju.charAt(0).toUpperCase()}${penyetuju.slice(1)}`}
      </span>
    </div>
  );
}
