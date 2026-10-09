import {
  Archive,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Hand,
  LoaderCircle,
  RefreshCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

import { Badge, type NadaBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// DESIGN §7: status selalu ikon + teks; warna hanya penguat.
const daftarStatus = {
  aktif: { label: "Aktif", nada: "success", ikon: CircleCheck },
  final: { label: "Final", nada: "success", ikon: CircleCheck },
  berhasilDisimpan: { label: "Berhasil disimpan", nada: "success", ikon: CircleCheck },
  sedangDiproses: { label: "Sedang diproses", nada: "info", ikon: LoaderCircle },
  sedangMenyimpan: { label: "Sedang menyimpan", nada: "info", ikon: LoaderCircle },
  siapDitinjau: { label: "Siap ditinjau", nada: "default", ikon: ClipboardList },
  draft: { label: "Draft", nada: "default", ikon: ClipboardList },
  peringatanImpor: { label: "Peringatan impor", nada: "warning", ikon: TriangleAlert },
  parsial: { label: "Parsial", nada: "warning", ikon: TriangleAlert },
  perluDihitungUlang: { label: "Perlu dihitung ulang", nada: "warning", ikon: TriangleAlert },
  errorImpor: { label: "Error impor", nada: "destructive", ikon: CircleX },
  gagal: { label: "Gagal", nada: "destructive", ikon: CircleX },
  stokNegatif: { label: "Stok negatif", nada: "destructive", ikon: CircleX },
  tersimpanGagalMuatUlang: {
    label: "Perubahan tersimpan. Muat ulang halaman untuk melihatnya.",
    nada: "warning",
    ikon: RefreshCcw,
  },
  belumDiketahui: { label: "Belum diketahui", nada: "muted", ikon: CircleDashed },
  tidakTersedia: { label: "Tidak tersedia", nada: "muted", ikon: CircleDashed },
  manual: { label: "Manual", nada: "muted", ikon: Hand },
  diarsipkan: { label: "Diarsipkan", nada: "muted", ikon: Archive },
} as const satisfies Record<string, { label: string; nada: NadaBadge; ikon: LucideIcon }>;

export type Status = keyof typeof daftarStatus;

export const semuaStatus = Object.keys(daftarStatus) as Status[];

export function BadgeStatus({
  status,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { status: Status }) {
  const { label, nada, ikon: Ikon } = daftarStatus[status];
  return (
    <Badge variant={nada} data-status={status} className={className} {...props}>
      <Ikon aria-hidden strokeWidth={2} className={cn(Ikon === LoaderCircle && "motion-safe:animate-spin")} />
      {label}
    </Badge>
  );
}
