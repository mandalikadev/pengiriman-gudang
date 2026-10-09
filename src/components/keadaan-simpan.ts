"use client";

import { useState, useTransition } from "react";

import type { KeadaanSimpan } from "@/components/pesan-status-simpan";

/** Hasil aksi simpan untuk PesanStatusSimpan (CODING_STANDARDS "Penyimpanan dan status"). */
export type HasilSimpan = { keadaan: "berhasil" | "tersimpanGagalMuatUlang" } | HasilGagal;
type HasilGagal = { keadaan: "gagal"; pesan: string };

type Tampilan = { keadaan: KeadaanSimpan; pesan?: string };

/** Pesan untuk hasil yang belum pasti: menyuruh memeriksa `yangDiperiksa`, bukan mengulang otomatis. */
export function pesanBelumPasti(yangDiperiksa: string) {
  return `Hasil belum pasti karena server tidak menjawab. Muat ulang halaman dan periksa ${yangDiperiksa} sebelum mencoba lagi.`;
}

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
  if (hasil) return hasil.keadaan === "gagal" ? { keadaan: "gagal", pesan: hasil.pesan } : { keadaan: hasil.keadaan };
  return berubah ? { keadaan: "belumDisimpan" } : null;
}

/**
 * Menjalankan satu aksi simpan dan melacak keadaannya. Galat jaringan/timeout tidak diulang otomatis
 * (CODING_STANDARDS): tampil "gagal" dengan pesan hasil belum pasti yang menyebut `yangDiperiksa`.
 */
export function usePenyimpanan<H extends HasilSimpan = HasilSimpan>(yangDiperiksa: string) {
  const [berubah, setBerubah] = useState(false);
  const [hasil, setHasil] = useState<H | HasilGagal | null>(null);
  const [menunggu, mulai] = useTransition();

  function tandaiBerubah() {
    setBerubah(true);
    setHasil(null);
  }

  function simpan(aksi: () => Promise<H>, setelahTersimpan?: () => void) {
    mulai(async () => {
      let hasilBaru: H | HasilGagal;
      try {
        hasilBaru = await aksi();
      } catch {
        hasilBaru = { keadaan: "gagal", pesan: pesanBelumPasti(yangDiperiksa) };
      }
      setHasil(hasilBaru);
      if (hasilBaru.keadaan !== "gagal") {
        setBerubah(false);
        setelahTersimpan?.();
      }
    });
  }

  return { tampilan: keadaanTampil({ berubah, menunggu, hasil }), hasil, menunggu, berubah, tandaiBerubah, simpan };
}
