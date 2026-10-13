"use client";

import { useState } from "react";

import { kelasChip } from "@/app/ringkasan/pilihan-ringkasan";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { BidangJadwal, ISIAN_KOSONG, isianTerkirim, type IsianJadwal } from "@/app/pengiriman-gudang/[id]/bidang-jadwal";

import { salinJadwalTetap, type HasilSalinJadwal as HasilAksiSalin } from "../aksi";
import { HasilSalinJadwal } from "./hasil-salin-jadwal";

export const JUDUL_SALIN_JADWAL = "Salin jadwal ke beberapa toko";

/**
 * Form salin jadwal (T57; T112, PRD A5 ▶ Revisi 2026-10-13): admin memilih beberapa toko di gudang ini, mengisi satu
 * pengaturan jadwal tetap, lalu menerapkannya langsung dengan satu tombol. Tidak ada template yang disimpan. Hasil tampil
 * per toko; hasil yang belum pasti tidak diulang otomatis. Peran admin dan aturan jadwal diperiksa lagi di server.
 */
export function FormSalinJadwal({ idGudang, daftarToko }: { idGudang: number; daftarToko: { id: number; nama: string }[] }) {
  const [terpilih, setTerpilih] = useState<ReadonlySet<number>>(new Set());
  const [isian, setIsian] = useState<IsianJadwal>(ISIAN_KOSONG);
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilAksiSalin>("jadwal tetap toko di daftar");
  const semuaTerpilih = daftarToko.every((t) => terpilih.has(t.id));
  const namaToko = new Map(daftarToko.map((t) => [t.id, t.nama]));

  function ubah(baru: Partial<IsianJadwal>) {
    setIsian((lama) => ({ ...lama, ...baru }));
    tandaiBerubah();
  }

  function pilih(idToko: number, dipilih: boolean) {
    setTerpilih((sebelumnya) => {
      const baru = new Set(sebelumnya);
      if (dipilih) baru.add(idToko);
      else baru.delete(idToko);
      return baru;
    });
    tandaiBerubah();
  }

  return (
    <form
      aria-label={JUDUL_SALIN_JADWAL}
      className="flex flex-col gap-4"
      data-salin-jadwal
      onSubmit={(event) => {
        event.preventDefault();
        const daftarIdToko = daftarToko.filter((t) => terpilih.has(t.id)).map((t) => t.id);
        simpan(() => salinJadwalTetap({ idGudang, daftarIdToko, ...isianTerkirim(isian) }));
      }}
    >
      <p className="text-muted-foreground">Pengaturan yang sama langsung menjadi jadwal tetap setiap toko terpilih.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Toko</legend>
        <label className={`${kelasChip} w-fit`}>
          <input
            type="checkbox"
            checked={semuaTerpilih}
            onChange={(e) => {
              setTerpilih(new Set(e.target.checked ? daftarToko.map((t) => t.id) : []));
              tandaiBerubah();
            }}
            className="size-4 accent-primary outline-none"
          />
          Pilih semua toko
        </label>
        <ul className="flex flex-wrap gap-3">
          {daftarToko.map((t) => (
            <li key={t.id}>
              <label className={kelasChip}>
                <input
                  type="checkbox"
                  name="toko"
                  value={t.id}
                  checked={terpilih.has(t.id)}
                  onChange={(e) => pilih(t.id, e.target.checked)}
                  className="size-4 accent-primary outline-none"
                />
                {t.nama}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <BidangJadwal isian={isian} ubah={ubah} nonaktif={false} />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={menunggu || terpilih.size === 0} className="active:scale-95">
          Terapkan ke toko terpilih
        </Button>
        <span className="text-muted-foreground">{terpilih.size} toko dipilih</span>
        {tampilan && tampilan.keadaan !== "berhasil" ? (
          <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} />
        ) : null}
      </div>
      {!menunggu && hasil && hasil.keadaan !== "gagal" ? (
        <HasilSalinJadwal hasil={hasil.hasil} namaToko={namaToko} />
      ) : null}
    </form>
  );
}
