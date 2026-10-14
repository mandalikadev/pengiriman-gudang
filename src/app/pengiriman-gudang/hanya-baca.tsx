import { Archive, Info } from "lucide-react";

import { BantuanIstilah } from "@/components/bantuan-istilah";
import { Badge } from "@/components/ui/badge";

/**
 * Keterangan untuk pengguna tanpa hak tindakan di gudang (PRD A3): halaman tampil tanpa kontrol ubah. `bantuan` memasang
 * bantuan istilah Hanya-baca (DESIGN §11.6); jangan dipakai di dalam tautan (kartu gudang), karena bantuan adalah tombol.
 */
export function KeteranganHanyaBaca({ children, bantuan = false }: { children: string; bantuan?: boolean }) {
  return (
    <p data-hanya-baca className="flex items-start gap-2">
      <Info aria-hidden strokeWidth={2} className="size-5 shrink-0 text-info" />
      <span>
        {children}
        {bantuan ? <BantuanIstilah istilah="hanyaBaca" className="-my-1 ml-1" /> : null}
      </span>
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
