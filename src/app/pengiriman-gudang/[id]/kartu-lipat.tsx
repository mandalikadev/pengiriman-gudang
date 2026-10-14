import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Card, CardDescription } from "@/components/ui/card";

/**
 * Kartu bagian yang bisa dibuka-tutup dan awalnya tertutup (DESIGN §11.5, T118): Jadwal toko dan Periode sumber di
 * halaman Pengiriman Gudang. Memakai `<details>` bawaan browser, jadi bekerja tanpa JavaScript dan dibacakan pembaca layar
 * sebagai tombol buka-tutup. Judul h2 berada di dalam `<summary>`; ikon `ChevronDown` berputar saat terbuka seperti
 * kelompok sidebar (DESIGN §5 ▶ 2026-10-11).
 */
export function KartuLipat({
  idJudul,
  judul,
  Ikon,
  deskripsi,
  children,
  ...props
}: {
  idJudul: string;
  judul: string;
  Ikon: LucideIcon;
  deskripsi: ReactNode;
  children: ReactNode;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <Card role="region" aria-labelledby={idJudul} {...props}>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <h2 id={idJudul} className="flex items-center gap-3 text-xl font-semibold">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Ikon strokeWidth={2} className="size-5" />
            </span>
            {judul}
          </h2>
          <ChevronDown
            aria-hidden
            strokeWidth={2}
            className="ml-auto size-5 shrink-0 text-primary transition-transform duration-300 ease-out group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <CardDescription>{deskripsi}</CardDescription>
          {children}
        </div>
      </details>
    </Card>
  );
}
