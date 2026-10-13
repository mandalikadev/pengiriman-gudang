"use client";

import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

// DESIGN §6 ▶ Revisi (2026-10-13 sore) dan §11.2: Panel samping dan Dialog dari Radix Dialog (paket `radix-ui`).
// - Panel samping: dari kanan, ±560 px di desktop, layar penuh di layar < 640 px.
// - Dialog: di tengah layar, untuk perbandingan singkat.
// - Menu: menu tarik layar < 1024 px (rounded-3xl, DESIGN §6).
// Ditutup dengan tombol Tutup, Esc, atau klik di luar; fokus terkunci di dalam lalu kembali ke pembukanya.
// Isi dirender di tempatnya (tanpa portal) agar ikut terender di server: tautan langsung (URL) langsung menampilkan
// isinya. Karena itu letakkan di luar elemen yang membentuk stacking context (tabel, sel menempel).

export const Dialog = DialogPrimitive.Root;
export const DialogTutup = DialogPrimitive.Close;

const kelasIsi = cva(
  "fixed z-50 flex flex-col border border-border/60 bg-card text-sm text-card-foreground shadow-float outline-none",
  {
    variants: {
      bentuk: {
        samping: "inset-y-0 right-0 w-full sm:w-[35rem] sm:max-w-[calc(100vw-2rem)] sm:rounded-l-3xl sm:border-r-0",
        // Di tengah tanpa translate (translate dimatikan saat prefers-reduced-motion, DESIGN §5).
        tengah: "inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl rounded-3xl",
        menu: "inset-4 gap-4 overflow-y-auto rounded-3xl p-4",
      },
    },
  },
);

type Bentuk = "samping" | "tengah" | "menu";

/**
 * Isi dialog: overlay, kepala (judul + tombol "Tutup" yang selalu terlihat), dan badan yang menggulir sendiri.
 * `bentuk="menu"` tanpa kepala bawaan: judul hanya untuk pembaca layar dan tombol tutup disediakan pemakai
 * (`DialogTutup`). `pembukaCadangan` = selektor elemen yang difokus setelah ditutup bila dialog tidak dibuka dari
 * sebuah elemen (mis. dibuka langsung dari URL).
 */
export function DialogIsi({
  bentuk,
  judul,
  pembukaCadangan,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  bentuk: Bentuk;
  judul: ReactNode;
  pembukaCadangan?: string;
  children: ReactNode;
}) {
  const pembuka = useRef<Element | null>(null);
  return (
    <>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-foreground/20" />
      <DialogPrimitive.Content
        data-slot="dialog-isi"
        data-bentuk={bentuk}
        aria-describedby={undefined}
        className={cn(kelasIsi({ bentuk }), className)}
        // Dicatat sebelum fokus pindah ke dalam dialog: elemen yang membukanya (bukan hanya Trigger Radix).
        onOpenAutoFocus={() => {
          pembuka.current = document.activeElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const asal = pembuka.current;
          if (asal instanceof HTMLElement && asal !== document.body && asal.isConnected) {
            asal.focus({ preventScroll: true });
          } else if (pembukaCadangan !== undefined) {
            document.querySelector<HTMLElement>(pembukaCadangan)?.focus();
          }
        }}
        {...props}
      >
        {bentuk === "menu" ? (
          <>
            <DialogPrimitive.Title className="sr-only">{judul}</DialogPrimitive.Title>
            {children}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-6 py-4">
              <DialogPrimitive.Title className="pt-1.5 text-lg font-semibold">{judul}</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" className="shrink-0">
                  <X aria-hidden strokeWidth={2} className="size-5" />
                  Tutup
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div data-slot="dialog-badan" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
              {children}
            </div>
          </>
        )}
      </DialogPrimitive.Content>
    </>
  );
}
