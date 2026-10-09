import { CircleCheck, LoaderCircle } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import type { StatusCacheLaporan as Status } from "@/server/laporan/cache";

// Status cache hasil hitung laporan (T33), dipakai di halaman Impor admin dan Ringkasan (T34).
// DESIGN §7: ikon + teks; "Terbaru" memakai nada dan ikon "Aktif", "Sedang dihitung" memakai nada dan ikon
// "Sedang diproses".
function BadgeCache({ status }: { status: Status }) {
  switch (status) {
    case "terbaru":
      return (
        <Badge variant="success" data-status-cache={status}>
          <CircleCheck aria-hidden strokeWidth={2} className="size-5" />
          Terbaru
        </Badge>
      );
    case "sedang-dihitung":
      return (
        <Badge variant="info" data-status-cache={status}>
          <LoaderCircle aria-hidden strokeWidth={2} className="size-5 motion-safe:animate-spin" />
          Sedang dihitung
        </Badge>
      );
    case "perlu-dihitung-ulang":
      return <BadgeStatus status="perluDihitungUlang" data-status-cache={status} />;
    case "gagal":
      return <BadgeStatus status="gagal" data-status-cache={status} />;
  }
}

export function StatusCacheLaporan({ status }: { status: Status }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="status">
      <span className="text-muted-foreground">Hasil hitung laporan</span>
      <BadgeCache status={status} />
    </div>
  );
}
