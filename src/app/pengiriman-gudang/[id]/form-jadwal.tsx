"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { nonaktifkanJadwal, simpanJadwal, usulkanJadwal, usulkanNonaktifJadwal } from "./aksi";
import { BidangJadwal, ISIAN_KOSONG, isianTerkirim, kelasLabel, type IsianJadwal } from "./bidang-jadwal";

/** `langsung` = gudang Pusat (PRD A5 ▶ OD-06); `usulan` = gudang lain, perubahan menunggu persetujuan admin (T56). */
export type JalurJadwal = "langsung" | "usulan";

type TokoForm = { id: number; nama: string; jadwal: IsianJadwal | null; adaUsulanMenunggu: boolean };

const teksJalur = {
  langsung: {
    keterangan: null,
    simpan: "Simpan jadwal",
    nonaktifkan: "Nonaktifkan jadwal",
    yangDiperiksa: "jadwal toko di daftar",
    aksiSimpan: simpanJadwal,
    aksiNonaktifkan: nonaktifkanJadwal,
  },
  usulan: {
    keterangan: "Usulan berlaku setelah disetujui admin. Sampai saat itu, jadwal aktif toko tetap dipakai.",
    simpan: "Kirim usulan",
    nonaktifkan: "Usulkan penonaktifan",
    yangDiperiksa: "status usulan toko di daftar",
    aksiSimpan: usulkanJadwal,
    aksiNonaktifkan: usulkanNonaktifJadwal,
  },
} as const;

/**
 * Form buat/ubah/nonaktifkan jadwal satu toko (T55, T56; PRD A5 ▶ OD-06). Di gudang Pusat perubahan langsung menjadi
 * jadwal aktif; di gudang lain menjadi usulan untuk disetujui admin. Memilih toko memuat jadwal aktifnya. Hak
 * `kelola-usulan-jadwal`, satu usulan menunggu per toko, dan aturan jadwal diperiksa lagi di server. Nama form adalah
 * judul halaman (`idJudul`, T103): form tidak mengulang h1.
 */
export function FormJadwal({
  idGudang,
  jalur,
  daftarToko,
  idJudul,
}: {
  idGudang: number;
  jalur: JalurJadwal;
  daftarToko: TokoForm[];
  idJudul: string;
}) {
  const id = useId();
  const teks = teksJalur[jalur];
  const [idToko, setIdToko] = useState("");
  const [isian, setIsian] = useState<IsianJadwal>(ISIAN_KOSONG);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan(teks.yangDiperiksa);
  const toko = daftarToko.find((t) => String(t.id) === idToko);
  const tertahan = toko?.adaUsulanMenunggu === true;

  function ubah(baru: Partial<IsianJadwal>) {
    setIsian((lama) => ({ ...lama, ...baru }));
    tandaiBerubah();
  }

  function pilihToko(nilai: string) {
    setIdToko(nilai);
    setIsian(daftarToko.find((t) => String(t.id) === nilai)?.jadwal ?? ISIAN_KOSONG);
    tandaiBerubah();
  }

  return (
    <form
      aria-labelledby={idJudul}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        simpan(() => teks.aksiSimpan({ idGudang, idToko: Number(idToko), ...isianTerkirim(isian) }));
      }}
    >
      {teks.keterangan ? <p className="text-muted-foreground">{teks.keterangan}</p> : null}

      <BidangJadwal
        isian={isian}
        ubah={ubah}
        nonaktif={!toko}
        bidangAwal={
          <div className={kelasLabel}>
            <span id={`${id}-toko`}>Toko</span>
            <Select value={idToko} onValueChange={pilihToko}>
              <SelectTrigger aria-labelledby={`${id}-toko`}>
                <SelectValue placeholder="Pilih toko">{toko?.nama}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {daftarToko.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          disabled={menunggu || !toko || tertahan}
          aria-describedby={tertahan ? `${id}-tertahan` : undefined}
          className="active:scale-95"
        >
          {teks.simpan}
        </Button>
        {toko?.jadwal ? (
          <Button
            type="button"
            variant="destructive"
            disabled={menunggu || tertahan}
            aria-describedby={tertahan ? `${id}-tertahan` : undefined}
            className="active:scale-95"
            onClick={() =>
              simpan(
                () => teks.aksiNonaktifkan({ idGudang, idToko: toko.id }),
                jalur === "langsung" ? () => setIsian(ISIAN_KOSONG) : undefined,
              )
            }
          >
            {teks.nonaktifkan}
          </Button>
        ) : null}
        {tertahan ? (
          <p id={`${id}-tertahan`} className="text-muted-foreground">
            Toko ini masih punya usulan jadwal yang menunggu persetujuan admin.
          </p>
        ) : null}
        {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
      </div>
    </form>
  );
}
