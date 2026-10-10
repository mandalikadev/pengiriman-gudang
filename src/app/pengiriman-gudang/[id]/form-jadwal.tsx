"use client";

import { useId, useState } from "react";

import { kelasChip } from "@/app/ringkasan/pilihan-ringkasan";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  daftarHariKirim,
  daftarPersiapan,
  daftarPolaJadwal,
  labelPersiapan,
  labelPola,
  type HariKirim,
  type Persiapan,
  type PolaJadwal,
} from "@/server/gudang/pilihan-jadwal";

import { nonaktifkanJadwal, simpanJadwal } from "./aksi";

/** Isian form jadwal satu toko; divalidasi domain (`periksaJadwal`, T54) di server. */
export type IsianJadwal = {
  pola: PolaJadwal;
  hariKirim: { hari: HariKirim; persiapan: Persiapan }[];
  tanggalJangkar: string | null;
};

type TokoForm = { id: number; nama: string; jadwal: IsianJadwal | null };

const ISIAN_KOSONG: IsianJadwal = { pola: "mingguan", hariKirim: [], tanggalJangkar: null };

const kelasLabel = "flex flex-col gap-2 font-semibold";

/**
 * Form buat/ubah/nonaktifkan jadwal satu toko gudang Pusat (T55, PRD A5 ▶ OD-06). Memilih toko memuat jadwal aktifnya.
 * Hak `kelola-usulan-jadwal` dan aturan jadwal diperiksa lagi di server.
 */
export function FormJadwal({ idGudang, daftarToko }: { idGudang: number; daftarToko: TokoForm[] }) {
  const id = useId();
  const [idToko, setIdToko] = useState("");
  const [isian, setIsian] = useState<IsianJadwal>(ISIAN_KOSONG);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("jadwal toko di daftar");
  const toko = daftarToko.find((t) => String(t.id) === idToko);
  const persiapanHari = new Map(isian.hariKirim.map((h) => [h.hari, h.persiapan]));

  function ubah(baru: Partial<IsianJadwal>) {
    setIsian((lama) => ({ ...lama, ...baru }));
    tandaiBerubah();
  }

  function pilihToko(nilai: string) {
    setIdToko(nilai);
    setIsian(daftarToko.find((t) => String(t.id) === nilai)?.jadwal ?? ISIAN_KOSONG);
    tandaiBerubah();
  }

  function pilihHari(hari: HariKirim, centang: boolean) {
    const sisa = isian.hariKirim.filter((h) => h.hari !== hari);
    ubah({ hariKirim: centang ? [...sisa, { hari, persiapan: "H" }] : sisa });
  }

  function pilihPersiapan(hari: HariKirim, persiapan: Persiapan) {
    ubah({ hariKirim: isian.hariKirim.map((h) => (h.hari === hari ? { hari, persiapan } : h)) });
  }

  return (
    <form
      aria-labelledby={`${id}-judul`}
      className="flex flex-col gap-4 border-t border-border/60 pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        const hariKirim = daftarHariKirim.flatMap((hari) => {
          const persiapan = persiapanHari.get(hari);
          return persiapan ? [{ hari, persiapan }] : [];
        });
        const tanggalJangkar = isian.pola === "dua-mingguan" ? isian.tanggalJangkar : null;
        simpan(() => simpanJadwal({ idGudang, idToko: Number(idToko), pola: isian.pola, hariKirim, tanggalJangkar }));
      }}
    >
      <h3 id={`${id}-judul`} className="text-lg font-semibold">
        Atur jadwal toko
      </h3>

      <div className="grid gap-4 md:grid-cols-2">
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
        <div className={kelasLabel}>
          <span id={`${id}-pola`}>Pola</span>
          <Select value={isian.pola} onValueChange={(nilai) => ubah({ pola: nilai as PolaJadwal })} disabled={!toko}>
            <SelectTrigger aria-labelledby={`${id}-pola`}>
              <SelectValue>{labelPola[isian.pola]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {daftarPolaJadwal.map((pola) => (
                <SelectItem key={pola} value={pola}>
                  {labelPola[pola]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={!toko}>
        <legend className="mb-2 font-semibold">Hari kirim dan persiapan</legend>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {daftarHariKirim.map((hari) => {
            const persiapan = persiapanHari.get(hari);
            return (
              <li key={hari} className="flex items-center gap-2">
                <label className={kelasChip}>
                  <input
                    type="checkbox"
                    name="hariKirim"
                    value={hari}
                    checked={persiapan !== undefined}
                    onChange={(e) => pilihHari(hari, e.target.checked)}
                    className="size-4 accent-primary outline-none"
                  />
                  {hari}
                </label>
                <Select
                  value={persiapan ?? ""}
                  onValueChange={(nilai) => pilihPersiapan(hari, nilai as Persiapan)}
                  disabled={!toko || persiapan === undefined}
                >
                  <SelectTrigger ukuran="tabel" aria-label={`Persiapan hari ${hari}`} className="w-24">
                    <SelectValue placeholder="—">{persiapan ? labelPersiapan[persiapan] : undefined}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {daftarPersiapan.map((p) => (
                      <SelectItem key={p} value={p}>
                        {labelPersiapan[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {isian.pola === "dua-mingguan" ? (
        <label className={`${kelasLabel} max-w-sm`}>
          Tanggal jangkar
          <Input
            type="date"
            value={isian.tanggalJangkar ?? ""}
            onChange={(e) => ubah({ tanggalJangkar: e.target.value || null })}
            disabled={!toko}
          />
          <span className="font-normal text-muted-foreground">
            Pekan (Senin–Minggu) yang memuat tanggal ini menjadi pekan kirim, lalu berulang setiap 14 hari.
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={menunggu || !toko} className="active:scale-95">
          Simpan jadwal
        </Button>
        {toko?.jadwal ? (
          <Button
            type="button"
            variant="destructive"
            disabled={menunggu}
            className="active:scale-95"
            onClick={() => simpan(() => nonaktifkanJadwal({ idGudang, idToko: toko.id }), () => setIsian(ISIAN_KOSONG))}
          >
            Nonaktifkan jadwal
          </Button>
        ) : null}
        {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
      </div>
    </form>
  );
}
