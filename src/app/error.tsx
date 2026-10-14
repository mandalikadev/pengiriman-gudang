"use client";

import { CircleX, House, RotateCcw } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Halaman error (DESIGN §11.7, ADR-0010): bertema terang di dalam kerangka aplikasi, dengan "Coba lagi" dan tautan ke
 * Beranda. Rincian teknis error tidak ditampilkan; server mencatatnya.
 */
export default function HalamanError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main
      data-halaman-error
      className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8"
    >
      <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <CircleX strokeWidth={2} className="size-5" />
      </span>
      <h1 className="text-2xl font-bold md:text-3xl">Terjadi kesalahan</h1>
      <p className="text-muted-foreground">Halaman ini gagal dimuat. Coba lagi, atau kembali ke Beranda.</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" className="h-11 active:scale-95" onClick={() => retry()}>
          <RotateCcw aria-hidden strokeWidth={2} className="size-5" />
          Coba lagi
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "h-11 active:scale-95" })}>
          <House aria-hidden strokeWidth={2} className="size-5" />
          Kembali ke Beranda
        </Link>
      </div>
    </main>
  );
}
