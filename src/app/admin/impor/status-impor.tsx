import { LoaderCircle } from "lucide-react";

import { BadgeStatus, type Status } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import type { StatusImpor } from "@/server/db/schema";

// DESIGN §7: status impor memakai badge status T07. "Diunggah" (menunggu worker) memakai nada dan ikon
// "Sedang diproses" karena keduanya bagian dari proses yang sedang berjalan.
const statusBadge = {
  diproses: "sedangDiproses",
  "siap-ditinjau": "siapDitinjau",
  gagal: "gagal",
  aktif: "aktif",
  diarsipkan: "diarsipkan",
} as const satisfies Record<Exclude<StatusImpor, "diunggah">, Status>;

export function BadgeStatusImpor({ status }: { status: StatusImpor }) {
  if (status === "diunggah") {
    return (
      <Badge variant="info" data-status-impor={status}>
        <LoaderCircle aria-hidden strokeWidth={2} className="size-5 motion-safe:animate-spin" />
        Diunggah, menunggu diproses
      </Badge>
    );
  }
  return <BadgeStatus status={statusBadge[status]} data-status-impor={status} />;
}

export function sedangBerjalan(status: StatusImpor) {
  return status === "diunggah" || status === "diproses";
}
