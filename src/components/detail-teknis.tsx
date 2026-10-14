import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { tautanTombolVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bagian "Detail teknis" yang bisa dibuka-tutup dan awalnya tertutup (DESIGN §11.6, T121): identitas teknis file
 * (SHA-256, ukuran dalam byte, nomor penetapan) disembunyikan di sini tanpa dihapus. Memakai `<details>` bawaan browser,
 * jadi bekerja tanpa JavaScript dan dibacakan sebagai tombol buka-tutup; ikon `ChevronDown` berputar saat terbuka seperti
 * kartu lipat (DESIGN §11.5).
 */
export function DetailTeknis({ children }: { children: ReactNode }) {
  return (
    <details data-detail-teknis className="group">
      <summary className={cn(tautanTombolVariants(), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
        Detail teknis
        <ChevronDown
          aria-hidden
          strokeWidth={2}
          className="size-5 shrink-0 transition-transform duration-300 ease-out group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="mt-2 flex flex-col gap-4">{children}</div>
    </details>
  );
}
