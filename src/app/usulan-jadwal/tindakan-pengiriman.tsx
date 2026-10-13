"use client";

import { useId, useState } from "react";

import { batalkanPengiriman } from "@/app/admin/jadwal/aksi";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { DialogKonfirmasi } from "@/components/ui/dialog-konfirmasi";
import { Input } from "@/components/ui/input";

import { batalkanPengirimanPusat, tarikPengiriman } from "./aksi";

// Tindakan per baris riwayat pengiriman di luar jadwal (T113, PRD A5 ▶ Revisi 2026-10-13). Kewenangan dan syarat
// diperiksa lagi di server; hasil yang belum pasti tidak diulang otomatis (usePenyimpanan).

const YANG_DIPERIKSA = "status pengiriman di daftar riwayat";

/** Pengusul menarik usulannya yang masih menunggu. */
export function TombolTarik({ idGudang, id, toko }: { idGudang: number; id: number; toko: string }) {
  const { tampilan, hasil, menunggu, simpan } = usePenyimpanan(YANG_DIPERIKSA);
  const selesai = hasil !== null && hasil.keadaan !== "gagal";
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={menunggu || selesai}
        onClick={() => simpan(() => tarikPengiriman({ idGudang, id }))}
      >
        Tarik<span className="sr-only"> usulan {toko}</span>
      </Button>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </div>
  );
}

/**
 * Membatalkan pengiriman yang berlaku dengan alasan wajib, lalu dialog konfirmasi (DESIGN §11.3). `idGudang` = gudang
 * Pusat operator yang membatalkan; `null` = admin.
 */
export function FormBatalkanPengiriman({
  id,
  idGudang,
  toko,
  tanggal,
}: {
  id: number;
  idGudang: number | null;
  toko: string;
  tanggal: string;
}) {
  const idAlasan = useId();
  const [alasan, setAlasan] = useState("");
  const [terbuka, setTerbuka] = useState(false);
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan(YANG_DIPERIKSA);
  const selesai = hasil !== null && hasil.keadaan !== "gagal";
  const terkunci = menunggu || selesai;

  return (
    <form
      className="flex min-w-64 flex-col items-start gap-2"
      aria-label={`Batalkan pengiriman ${toko} ${tanggal}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (alasan.trim() !== "") setTerbuka(true);
      }}
    >
      <label htmlFor={idAlasan} className="font-semibold">
        Alasan pembatalan
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={idAlasan}
          required
          value={alasan}
          disabled={terkunci}
          ukuran="tabel"
          className="w-48"
          onChange={(event) => {
            setAlasan(event.target.value);
            tandaiBerubah();
          }}
        />
        <Button type="submit" size="sm" variant="destructiveOutline" disabled={terkunci || alasan.trim() === ""}>
          Batalkan
        </Button>
      </div>
      <DialogKonfirmasi
        terbuka={terbuka}
        ubahTerbuka={setTerbuka}
        judul={`Batalkan pengiriman ${toko} ${tanggal}?`}
        akibat="Pengiriman ini tidak lagi berlaku. Untuk jenis pindah, tanggal rutinnya kembali menjadi tanggal kirim."
        labelTindakan="Batalkan pengiriman"
        destruktif
        konfirmasi={() =>
          simpan(() => (idGudang === null ? batalkanPengiriman({ id, alasan }) : batalkanPengirimanPusat({ idGudang, id, alasan })))
        }
      />
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </form>
  );
}
