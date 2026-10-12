"use client";

import { useRef, useState, type ReactNode } from "react";

import type { HasilDaftarSheet } from "@/server/impor/impor";

import { AktifkanSemuaImpor } from "./aktifkan-semua-impor";
import { FormUnggahImpor } from "./form-unggah-impor";
import { RingkasanHasilDaftar } from "./ringkasan-hasil-daftar";

/**
 * Form unggah dan Daftar impor dalam satu halaman. Setelah dikirim, admin dibawa ke Daftar impor yang memuat
 * ringkasan hasil per sheet (PRD A1, Keputusan 2026-10-12). `daftarImpor` adalah tabel yang dirender server;
 * `jumlahSiap` = impor siap ditinjau tanpa error untuk tombol "Aktifkan semua yang siap".
 */
export function AlurUnggahImpor({ daftarImpor, jumlahSiap }: { daftarImpor: ReactNode; jumlahSiap: number }) {
  const [hasilSheet, setHasilSheet] = useState<readonly HasilDaftarSheet[] | null>(null);
  const bagianDaftar = useRef<HTMLElement>(null);

  return (
    <>
      <FormUnggahImpor
        onTerkirim={(hasil) => {
          setHasilSheet(hasil.sheet ?? null);
          // Tunggu ringkasan dirender sebelum menggulir.
          requestAnimationFrame(() => bagianDaftar.current?.scrollIntoView({ block: "start" }));
        }}
      />

      <section ref={bagianDaftar} id="daftar-impor" className="flex scroll-mt-6 flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar impor</h2>
        <AktifkanSemuaImpor jumlahSiap={jumlahSiap} />
        {hasilSheet ? <RingkasanHasilDaftar sheet={hasilSheet} /> : null}
        {daftarImpor}
      </section>
    </>
  );
}
