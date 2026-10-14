import { FileQuestion, House } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan — Dashboard Penjualan MANDALIKA",
};

/**
 * Halaman tidak ditemukan (DESIGN §11.7, ADR-0010): bertema terang di dalam kerangka aplikasi. Dipakai untuk URL yang
 * tidak dikenal dan setiap `notFound()`, termasuk pengguna yang tidak berhak membuka sebuah halaman.
 */
export default function HalamanTidakDitemukan() {
  return (
    <main
      data-halaman-tidak-ditemukan
      className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8"
    >
      <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <FileQuestion strokeWidth={2} className="size-5" />
      </span>
      <h1 className="text-2xl font-bold md:text-3xl">Halaman tidak ditemukan</h1>
      <p className="text-muted-foreground">Halaman ini tidak ada atau tidak tersedia untuk akun Anda.</p>
      <Link href="/" className={buttonVariants({ className: "h-11 active:scale-95" })}>
        <House aria-hidden strokeWidth={2} className="size-5" />
        Kembali ke Beranda
      </Link>
    </main>
  );
}
