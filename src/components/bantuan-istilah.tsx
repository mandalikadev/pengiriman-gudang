"use client";

import { CircleHelp } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { TEKS_BANTUAN_ISTILAH, type IstilahBantuan } from "./teks-bantuan-istilah";

/**
 * Bantuan singkat untuk satu istilah domain (DESIGN §11.6, T121): ikon `CircleHelp` di samping istilah membuka penjelasan
 * satu atau dua kalimat dalam popover Radix. Dibuka dengan klik, Enter, atau Spasi; ditutup dengan Esc, klik di luar, atau
 * menekan ikonnya lagi. Teksnya dari `teks-bantuan-istilah.ts`. Tombol hanya berlabel `aria-label`, sehingga teks di
 * sekitarnya tidak berubah bagi pembaca layar maupun salinan teks.
 */
export function BantuanIstilah({ istilah, className }: { istilah: IstilahBantuan; className?: string }) {
  const [terbuka, setTerbuka] = useState(false);
  const idJudul = useId();
  const { judul, penjelasan } = TEKS_BANTUAN_ISTILAH[istilah];

  // Enter dan Spasi ditangani langsung (bukan menunggu klik sintetis browser) agar perilakunya sama di semua browser;
  // default-nya dicegah supaya browser tidak mengirim klik kedua yang menutupnya lagi.
  const tekanTombol = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setTerbuka((nilai) => !nilai);
  };
  const lepasTombol = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " ") event.preventDefault();
  };

  return (
    <Popover.Root open={terbuka} onOpenChange={setTerbuka}>
      <Popover.Trigger
        type="button"
        aria-label={`Apa itu ${judul}?`}
        data-bantuan-istilah={istilah}
        onKeyDown={tekanTombol}
        onKeyUp={lepasTombol}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full align-middle text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className,
        )}
      >
        <CircleHelp aria-hidden strokeWidth={2} className="size-5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-labelledby={idJudul}
          data-isi-bantuan-istilah={istilah}
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 flex max-w-xs flex-col gap-1 rounded-2xl border border-border/60 bg-card p-4 text-sm text-card-foreground shadow-float outline-none"
        >
          <p id={idJudul} className="font-semibold">
            {judul}
          </p>
          <p>{penjelasan}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
