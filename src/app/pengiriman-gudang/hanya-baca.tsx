import { Info } from "lucide-react";

/** Keterangan untuk pengguna tanpa hak tindakan di gudang (PRD A3): halaman tampil tanpa kontrol ubah. */
export function KeteranganHanyaBaca({ children }: { children: string }) {
  return (
    <p data-hanya-baca className="flex items-start gap-2">
      <Info aria-hidden strokeWidth={2} className="size-5 shrink-0 text-info" />
      {children}
    </p>
  );
}
