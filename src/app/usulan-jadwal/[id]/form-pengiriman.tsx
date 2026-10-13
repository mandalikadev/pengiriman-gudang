"use client";

import { useId, useState } from "react";

import { kelasLabel } from "@/app/pengiriman-gudang/[id]/bidang-jadwal";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTanggal } from "@/domain/kalender";
import type { JenisPengirimanDiLuarJadwal } from "@/server/db/schema";
import type { TokoPilihanPengiriman } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { daftarPersiapan, labelPersiapan, persiapanDariHari, type Persiapan } from "@/server/gudang/pilihan-jadwal";

import { usulkanPengiriman } from "../aksi";
import { labelJenisPengiriman } from "../tampilan-pengiriman";

type Isian = {
  idToko: string;
  jenis: JenisPengirimanDiLuarJadwal | "";
  tanggalRutinDipindah: string;
  tanggalKirim: string;
  persiapan: Persiapan | "";
  alasan: string;
};

const ISIAN_KOSONG: Isian = { idToko: "", jenis: "", tanggalRutinDipindah: "", tanggalKirim: "", persiapan: "", alasan: "" };

const teksJalur = {
  langsung: {
    keterangan: "Pengiriman langsung berlaku. Jadwal tetap toko tidak berubah.",
    simpan: "Simpan",
  },
  usulan: {
    keterangan: "Usulan berlaku setelah disetujui admin. Jadwal tetap toko tidak berubah.",
    simpan: "Kirim usulan",
  },
} as const;

/**
 * Form pengiriman di luar jadwal satu toko (T113, PRD A5 ▶ Revisi 2026-10-13): toko yang punya jadwal tetap aktif,
 * jenis (Tambahan/Pindah), tanggal kirim, persiapan, dan alasan wajib. Untuk Pindah dipilih tanggal rutin yang dipindah
 * dari tanggal kirim rutin toko itu yang akan datang; persiapan awalnya mengikuti tanggal rutin itu. Di Pusat langsung
 * berlaku ("Simpan"), di gudang lain menunggu persetujuan admin ("Kirim usulan"). Syarat diperiksa lagi di server. Nama
 * form adalah judul halaman (`idJudul`).
 */
export function FormPengiriman({
  idGudang,
  jalur,
  daftarToko,
  idJudul,
}: {
  idGudang: number;
  jalur: "langsung" | "usulan";
  daftarToko: TokoPilihanPengiriman[];
  idJudul: string;
}) {
  const id = useId();
  const teks = teksJalur[jalur];
  const [isian, setIsian] = useState<Isian>(ISIAN_KOSONG);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("riwayat pengiriman di luar jadwal di bawah");
  const toko = daftarToko.find((t) => String(t.id) === isian.idToko);
  const pindah = isian.jenis === "pindah";

  function ubah(baru: Partial<Isian>) {
    setIsian((lama) => ({ ...lama, ...baru }));
    tandaiBerubah();
  }

  function pilihTanggalRutin(tanggal: string) {
    const rutin = toko?.tanggalRutin.find((r) => r.tanggal === tanggal);
    ubah({ tanggalRutinDipindah: tanggal, ...(rutin ? { persiapan: persiapanDariHari[rutin.persiapanHari] } : {}) });
  }

  const lengkap =
    toko !== undefined &&
    isian.jenis !== "" &&
    isian.tanggalKirim !== "" &&
    isian.persiapan !== "" &&
    isian.alasan.trim() !== "" &&
    (!pindah || isian.tanggalRutinDipindah !== "");

  return (
    <form
      aria-labelledby={idJudul}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!lengkap) return;
        simpan(
          () =>
            usulkanPengiriman({
              idGudang,
              idToko: Number(isian.idToko),
              jenis: isian.jenis,
              tanggalKirim: isian.tanggalKirim,
              persiapan: isian.persiapan,
              tanggalRutinDipindah: pindah ? isian.tanggalRutinDipindah : null,
              alasan: isian.alasan,
            }),
          () => setIsian(ISIAN_KOSONG),
        );
      }}
    >
      <p className="text-muted-foreground">{teks.keterangan}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className={kelasLabel}>
          <span id={`${id}-toko`}>Toko</span>
          <Select value={isian.idToko} onValueChange={(nilai) => ubah({ idToko: nilai, tanggalRutinDipindah: "" })}>
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

        <div className={kelasLabel}>
          <span id={`${id}-jenis`}>Jenis</span>
          <Select value={isian.jenis} onValueChange={(nilai) => ubah({ jenis: nilai as JenisPengirimanDiLuarJadwal })}>
            <SelectTrigger aria-labelledby={`${id}-jenis`}>
              <SelectValue placeholder="Pilih jenis">{isian.jenis === "" ? undefined : labelJenisPengiriman[isian.jenis]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tambahan">Tambahan (pengiriman rutin tetap berjalan)</SelectItem>
              <SelectItem value="pindah">Pindah (satu tanggal rutin dipindah)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {pindah ? (
          <div className={kelasLabel}>
            <span id={`${id}-rutin`}>Tanggal rutin yang dipindah</span>
            <Select value={isian.tanggalRutinDipindah} onValueChange={pilihTanggalRutin} disabled={!toko}>
              <SelectTrigger aria-labelledby={`${id}-rutin`}>
                <SelectValue placeholder={toko ? "Pilih tanggal rutin" : "Pilih toko dulu"} />
              </SelectTrigger>
              <SelectContent>
                {(toko?.tanggalRutin ?? []).map((r) => (
                  <SelectItem key={r.tanggal} value={r.tanggal}>
                    {formatTanggal(r.tanggal)} ({labelPersiapan[persiapanDariHari[r.persiapanHari]]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <label className={kelasLabel}>
          Tanggal kirim
          <Input type="date" required value={isian.tanggalKirim} onChange={(event) => ubah({ tanggalKirim: event.target.value })} />
        </label>

        <div className={kelasLabel}>
          <span id={`${id}-persiapan`}>Persiapan</span>
          <Select value={isian.persiapan} onValueChange={(nilai) => ubah({ persiapan: nilai as Persiapan })}>
            <SelectTrigger aria-labelledby={`${id}-persiapan`}>
              <SelectValue placeholder="Pilih persiapan">{isian.persiapan === "" ? undefined : labelPersiapan[isian.persiapan]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {daftarPersiapan.map((p) => (
                <SelectItem key={p} value={p}>
                  {labelPersiapan[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className={`${kelasLabel} sm:col-span-2 lg:col-span-3`}>
          Alasan
          <Input required value={isian.alasan} onChange={(event) => ubah({ alasan: event.target.value })} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={menunggu || !lengkap} className="active:scale-95">
          {teks.simpan}
        </Button>
        {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
      </div>
    </form>
  );
}
