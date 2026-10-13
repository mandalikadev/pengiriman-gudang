"use client";

import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

import { Button } from "./button";

// DESIGN §11.3: dialog konfirmasi aplikasi untuk tindakan yang menghapus, menonaktifkan, mencabut, melepas, membatalkan,
// atau tidak bisa diurungkan. Dibangun dari Radix AlertDialog (paket `radix-ui`): fokus awal pada "Batal", Esc = Batal,
// klik di luar tidak menutup. Dirender lewat portal karena pembukanya sering berada di sel tabel yang menempel
// (stacking context); dialog ini hanya dibuka di klien, jadi tidak perlu ikut terender di server.

/**
 * Dialog konfirmasi: judul berupa pertanyaan, `akibat` dalam satu atau dua kalimat, isi tambahan (mis. ringkasan
 * finalisasi), tombol "Batal", dan tombol tindakan bertuliskan kata kerjanya. `destruktif` = tombol tindakan bervarian
 * `destructive`. Dibuka oleh `pemicu` (tombol), atau dikendalikan lewat `terbuka`/`ubahTerbuka` bila dibuka dari kode
 * (mis. setelah form lolos validasi). `konfirmasi` dijalankan hanya saat tombol tindakan dipilih.
 */
export function DialogKonfirmasi({
  pemicu,
  terbuka,
  ubahTerbuka,
  judul,
  akibat,
  labelTindakan,
  destruktif = false,
  konfirmasi,
  children,
}: {
  pemicu?: ReactElement;
  terbuka?: boolean;
  ubahTerbuka?: (terbuka: boolean) => void;
  judul: string;
  akibat?: ReactNode;
  labelTindakan: string;
  destruktif?: boolean;
  konfirmasi: () => void;
  children?: ReactNode;
}) {
  return (
    <AlertDialogPrimitive.Root open={terbuka} onOpenChange={ubahTerbuka}>
      {pemicu === undefined ? null : <AlertDialogPrimitive.Trigger asChild>{pemicu}</AlertDialogPrimitive.Trigger>}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay data-slot="dialog-konfirmasi-overlay" className="fixed inset-0 z-50 bg-foreground/20" />
        <AlertDialogPrimitive.Content
          data-slot="dialog-konfirmasi"
          // Di tengah tanpa translate (translate dimatikan saat prefers-reduced-motion, DESIGN §5).
          className="fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col gap-4 overflow-y-auto rounded-3xl border border-border/60 bg-card p-6 text-sm text-card-foreground shadow-float outline-none"
          {...(akibat === undefined ? { "aria-describedby": undefined } : {})}
        >
          <AlertDialogPrimitive.Title className="text-lg font-semibold">{judul}</AlertDialogPrimitive.Title>
          {akibat === undefined ? null : <AlertDialogPrimitive.Description>{akibat}</AlertDialogPrimitive.Description>}
          {children}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline">
                Batal
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button type="button" variant={destruktif ? "destructive" : "default"} onClick={konfirmasi}>
                {labelTindakan}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
