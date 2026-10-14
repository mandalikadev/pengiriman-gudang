import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Keadaan kosong di halaman kerja (DESIGN §11.6, §7): ikon + teks + satu kalimat langkah berikutnya. Ikon 20 px dalam
 * wadah `rounded-2xl bg-primary/10` (DESIGN §6). `children` untuk tombol tindakan langsung, bila ada.
 */
export function KeadaanKosong({
  ikon: Ikon,
  judul,
  langkah,
  children,
}: {
  ikon: LucideIcon;
  judul: string;
  /** Satu kalimat langkah berikutnya. */
  langkah: string;
  children?: ReactNode;
}) {
  return (
    <div data-keadaan-kosong className="flex items-start gap-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Ikon strokeWidth={2} className="size-5" />
      </span>
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-foreground">{judul}</p>
        <p className="text-muted-foreground">{langkah}</p>
        {children}
      </div>
    </div>
  );
}
