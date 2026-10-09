import type { Metadata } from "next";

import { Card } from "@/components/ui/card";

import { FormMasuk } from "./form-masuk";

export const metadata: Metadata = {
  title: "Masuk — Dashboard Penjualan MANDALIKA",
};

// Zona suasana (DESIGN §1): blob latar maksimal 2, judul Fraunces besar, jarak lega. Form tunggal max-w-3xl.
export default function HalamanMasuk() {
  return (
    <main className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-32 -right-24 size-96 rounded-full bg-clay/20 blur-3xl" />
      </div>
      <div className="mx-auto flex max-w-md flex-col gap-8 px-4 py-16 text-base sm:px-6 md:py-24">
        <h1 className="text-4xl font-bold text-foreground md:text-5xl">Masuk</h1>
        <Card className="rounded-tl-[4rem] p-8">
          <FormMasuk />
        </Card>
      </div>
    </main>
  );
}
