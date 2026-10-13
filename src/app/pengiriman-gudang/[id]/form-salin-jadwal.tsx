"use client";

import { useId, useState } from "react";

import { kelasChip } from "@/app/ringkasan/pilihan-ringkasan";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { salinJadwal, type HasilSalinJadwal as HasilAksiSalin } from "./aksi";
import { BidangJadwal, ISIAN_KOSONG, isianTerkirim, type IsianJadwal } from "./bidang-jadwal";
import type { JalurJadwal } from "./form-jadwal";
import { HasilSalinJadwal } from "./hasil-salin-jadwal";

const teksJalur = {
  langsung: {
    keterangan: "Pengaturan yang sama langsung menjadi jadwal aktif setiap toko terpilih.",
    terapkan: "Terapkan ke toko terpilih",
    yangDiperiksa: "jadwal toko di daftar",
  },
  usulan: {
    keterangan:
      "Setiap toko terpilih mendapat usulan tersendiri yang disetujui atau ditolak admin. Sampai saat itu, jadwal aktif toko tetap dipakai.",
    terapkan: "Kirim usulan ke toko terpilih",
    yangDiperiksa: "jadwal dan status usulan toko di daftar",
  },
} as const;

/**
 * Form salin jadwal (T57, PRD A5 ▶ Keputusan perencanaan M2–M3): pilih beberapa toko di gudang ini, isi satu
 * pengaturan jadwal, lalu terapkan dengan satu tombol. Tidak ada template yang disimpan. Hasil tampil per toko; hasil
 * yang belum pasti tidak diulang otomatis. Hak `kelola-usulan-jadwal` dan aturan jadwal diperiksa lagi di server.
 */
export function FormSalinJadwal({
  idGudang,
  jalur,
  daftarToko,
}: {
  idGudang: number;
  jalur: JalurJadwal;
  daftarToko: { id: number; nama: string }[];
}) {
  const id = useId();
  const teks = teksJalur[jalur];
  const [terpilih, setTerpilih] = useState<ReadonlySet<number>>(new Set());
  const [isian, setIsian] = useState<IsianJadwal>(ISIAN_KOSONG);
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilAksiSalin>(teks.yangDiperiksa);
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
      aria-labelledby={`${id}-judul`}
      className="flex flex-col gap-4"
      data-salin-jadwal
      onSubmit={(event) => {
        event.preventDefault();
        const daftarIdToko = daftarToko.filter((t) => terpilih.has(t.id)).map((t) => t.id);
        simpan(() => salinJadwal({ idGudang, daftarIdToko, ...isianTerkirim(isian) }));
      }}
    >
      <h3 id={`${id}-judul`} className="text-lg font-semibold">
        Salin jadwal ke beberapa toko
      </h3>
      <p className="text-muted-foreground">{teks.keterangan}</p>

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
          {teks.terapkan}
        </Button>
        <span className="text-muted-foreground">{terpilih.size} toko dipilih</span>
        {tampilan && tampilan.keadaan !== "berhasil" ? (
          <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} />
        ) : null}
      </div>
      {!menunggu && hasil && hasil.keadaan !== "gagal" ? (
        <HasilSalinJadwal jalur={jalur} hasil={hasil.hasil} namaToko={namaToko} />
      ) : null}
    </form>
  );
}
