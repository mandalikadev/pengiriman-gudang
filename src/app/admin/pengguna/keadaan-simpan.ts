"use client";

import { useState, useTransition } from "react";

import type { KeadaanSimpan } from "@/components/pesan-status-simpan";

import type { HasilSimpan } from "./aksi";

type Tampilan = { keadaan: KeadaanSimpan; pesan?: string };

export const PESAN_BELUM_PASTI =
  "Hasil belum pasti karena server tidak menjawab. Muat ulang halaman dan periksa daftar pengguna sebelum mencoba lagi.";

/** Keadaan yang ditampilkan PesanStatusSimpan; `null` = tidak ada pesan. */
export function keadaanTampil({
  berubah,
  menunggu,
  hasil,
}: {
  berubah: boolean;
  menunggu: boolean;
  hasil: HasilSimpan | null;
}): Tampilan | null {
  if (menunggu) return { keadaan: "menyimpan" };
  if (hasil) return hasil;
  return berubah ? { keadaan: "belumDisimpan" } : null;
}

/**
 * Menjalankan satu aksi simpan dan melacak keadaannya. Galat jaringan/timeout tidak diulang otomatis
 * (CODING_STANDARDS): tampil "gagal" dengan pesan hasil belum pasti.
 */
export function usePenyimpanan() {
  const [berubah, setBerubah] = useState(false);
  const [hasil, setHasil] = useState<HasilSimpan | null>(null);
  const [menunggu, mulai] = useTransition();

  function tandaiBerubah() {
    setBerubah(true);
    setHasil(null);
  }

  function simpan(aksi: () => Promise<HasilSimpan>, setelahTersimpan?: () => void) {
    mulai(async () => {
      let hasilBaru: HasilSimpan;
      try {
        hasilBaru = await aksi();
      } catch {
        hasilBaru = { keadaan: "gagal", pesan: PESAN_BELUM_PASTI };
      }
      setHasil(hasilBaru);
      if (hasilBaru.keadaan !== "gagal") {
        setBerubah(false);
        setelahTersimpan?.();
      }
    });
  }

  return { tampilan: keadaanTampil({ berubah, menunggu, hasil }), menunggu, berubah, tandaiBerubah, simpan };
}
