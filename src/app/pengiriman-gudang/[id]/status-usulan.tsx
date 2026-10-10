import { CircleCheck, CircleX, ClipboardList, type LucideIcon } from "lucide-react";

import { Badge, type NadaBadge } from "@/components/ui/badge";
import type { JenisUsulanJadwal, StatusUsulanJadwal } from "@/server/db/schema";

// DESIGN §7: status selalu ikon + teks; warna ikon dari token status, teks foreground. Usulan jadwal memakai token dan
// ikon yang sudah ada: menunggu = menunggu tinjauan admin (nada dan ikon "Siap ditinjau", sama seperti snapshot libur
// "Menunggu persetujuan"), disetujui = berhasil, ditolak = gagal.
const tampilanStatus = {
  menunggu: { label: "Menunggu persetujuan", nada: "default", ikon: ClipboardList },
  disetujui: { label: "Disetujui", nada: "success", ikon: CircleCheck },
  ditolak: { label: "Ditolak", nada: "destructive", ikon: CircleX },
} as const satisfies Record<StatusUsulanJadwal, { label: string; nada: NadaBadge; ikon: LucideIcon }>;

export const labelJenisUsulan: Record<JenisUsulanJadwal, string> = {
  buat: "Buat jadwal",
  ubah: "Ubah jadwal",
  nonaktifkan: "Nonaktifkan jadwal",
};

export function BadgeStatusUsulan({ status }: { status: StatusUsulanJadwal }) {
  const { label, nada, ikon: Ikon } = tampilanStatus[status];
  return (
    <Badge variant={nada} data-status-usulan={status}>
      <Ikon aria-hidden strokeWidth={2} className="size-5" />
      {label}
    </Badge>
  );
}
