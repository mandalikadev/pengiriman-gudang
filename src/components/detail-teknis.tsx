import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Bagian "Detail teknis" yang bisa dibuka-tutup dan awalnya tertutup (DESIGN §11.6, T121): identitas teknis file
 * (SHA-256, ukuran dalam byte, nomor penetapan) disembunyikan di sini tanpa dihapus. Memakai `<details>` bawaan browser,
 * jadi bekerja tanpa JavaScript dan dibacakan sebagai tombol buka-tutup; ikon `ChevronDown` berputar saat terbuka seperti
 * kartu lipat (DESIGN §11.5).
 */
export function DetailTeknis({ children }: { children: ReactNode }) {
  return (
    <details data-detail-teknis className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
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
