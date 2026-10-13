import { Archive, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Keterangan untuk pengguna tanpa hak tindakan di gudang (PRD A3): halaman tampil tanpa kontrol ubah. */
export function KeteranganHanyaBaca({ children }: { children: string }) {
  return (
    <p data-hanya-baca className="flex items-start gap-2">
      <Info aria-hidden strokeWidth={2} className="size-5 shrink-0 text-info" />
      {children}
    </p>
  );
}

/** Badge gudang nonaktif (T110): admin tetap bisa membuka halaman gudang nonaktif, hanya-baca. */
export function BadgeGudangNonaktif() {
  return (
    <Badge variant="muted" data-status="gudangNonaktif" className="w-fit">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}
