"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Dialog, DialogIsi } from "@/components/ui/dialog";

// DESIGN §11.2: rincian yang keadaan terbukanya tersimpan di URL (`?rincian=`, `?mingguSama=`) supaya tautan langsung
// tetap bisa dibuka. Server hanya merender komponen ini bila URL meminta isinya. Tautan pembuka memakai navigasi klien
// tanpa menggulir (`<Link scroll={false}>`), jadi halaman tidak dimuat ulang. Menutup langsung menyembunyikan dialog,
// lalu mengganti URL ke `urlTutup` tanpa menggulir.

export function DialogUrl({
  bentuk,
  judul,
  urlTutup,
  pembukaCadangan,
  children,
}: {
  bentuk: "samping" | "tengah";
  judul: string;
  /** Alamat halaman yang sama tanpa dialog ini terbuka. */
  urlTutup: string;
  /** Selektor tautan pembuka; difokus setelah ditutup bila dialog dibuka langsung dari URL. */
  pembukaCadangan?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [terbuka, setTerbuka] = useState(true);
  return (
    <Dialog
      open={terbuka}
      onOpenChange={(buka) => {
        if (buka) return;
        setTerbuka(false);
        router.push(urlTutup, { scroll: false });
      }}
    >
      <DialogIsi bentuk={bentuk} judul={judul} pembukaCadangan={pembukaCadangan}>
        {children}
      </DialogIsi>
    </Dialog>
  );
}
