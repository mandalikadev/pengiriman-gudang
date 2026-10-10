import { CircleDashed, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";

import { Badge, type NadaBadge } from "@/components/ui/badge";
import type { MasalahBarisDraft } from "@/server/gudang/masalah-draft";

// DESIGN §7: masalah tampil sebagai ikon + teks. Token dan ikon mengikuti status yang sudah ada: tidak tersedia dan stok
// belum diisi = belum diketahui, stok negatif = error, belum dipetakan = seperti di halaman Pemetaan produk.
const tampilanMasalah = {
  "kebutuhan-tidak-tersedia": { label: "Kebutuhan tidak tersedia", nada: "muted", ikon: CircleDashed },
  "belum-dipetakan": { label: "Belum dipetakan", nada: "warning", ikon: TriangleAlert },
  "stok-negatif": { label: "Stok negatif", nada: "destructive", ikon: CircleX },
  "stok-belum-diisi": { label: "Stok belum diisi", nada: "muted", ikon: CircleDashed },
} as const satisfies Record<MasalahBarisDraft, { label: string; nada: NadaBadge; ikon: LucideIcon }>;

/** Masalah satu baris draft yang menahan finalisasi, dalam urutan tampilan (T66). */
export function DaftarMasalah({ masalah }: { masalah: readonly MasalahBarisDraft[] }) {
  if (masalah.length === 0) return null;
  return (
    <ul aria-label="Masalah" className="flex flex-col gap-1">
      {masalah.map((m) => {
        const { label, nada, ikon: Ikon } = tampilanMasalah[m];
        return (
          <li key={m}>
            <Badge variant={nada} data-masalah={m}>
              <Ikon aria-hidden strokeWidth={2} />
              {label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
