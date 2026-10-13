"use client";

import { useId, type ReactNode } from "react";

import { kelasChip } from "@/app/ringkasan/pilihan-ringkasan";
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

/** Isian satu pengaturan jadwal; divalidasi domain (`periksaJadwal`, T54) di server. */
export type IsianJadwal = {
  pola: PolaJadwal;
  hariKirim: { hari: HariKirim; persiapan: Persiapan }[];
  tanggalJangkar: string | null;
};

export const ISIAN_KOSONG: IsianJadwal = {
  pola: "mingguan",
  hariKirim: [],
  tanggalJangkar: null,
};

export const kelasLabel = "flex flex-col gap-2 font-semibold";

/** Isian siap kirim: hari kirim urut Senin–Minggu, tanggal jangkar hanya untuk pola dua mingguan. */
export function isianTerkirim(isian: IsianJadwal): IsianJadwal {
  const persiapanHari = new Map(isian.hariKirim.map((h) => [h.hari, h.persiapan]));
  const hariKirim = daftarHariKirim.flatMap((hari) => {
    const persiapan = persiapanHari.get(hari);
    return persiapan ? [{ hari, persiapan }] : [];
  });
  return {
    pola: isian.pola,
    hariKirim,
    tanggalJangkar: isian.pola === "dua-mingguan" ? isian.tanggalJangkar : null,
  };
}

/**
 * Bidang pola, hari kirim beserta persiapannya, dan tanggal jangkar (PRD A5). Dipakai form jadwal satu toko (T55, T56)
 * dan form salin jadwal (T57). `bidangAwal` tampil di baris yang sama dengan pola (mis. pilihan toko).
 */
export function BidangJadwal({
  isian,
  ubah,
  nonaktif,
  bidangAwal,
}: {
  isian: IsianJadwal;
  ubah: (baru: Partial<IsianJadwal>) => void;
  nonaktif: boolean;
  bidangAwal?: ReactNode;
}) {
  const id = useId();
  const persiapanHari = new Map(isian.hariKirim.map((h) => [h.hari, h.persiapan]));

  function pilihHari(hari: HariKirim, centang: boolean) {
    const sisa = isian.hariKirim.filter((h) => h.hari !== hari);
    ubah({ hariKirim: centang ? [...sisa, { hari, persiapan: "H" }] : sisa });
  }

  function pilihPersiapan(hari: HariKirim, persiapan: Persiapan) {
    ubah({
      hariKirim: isian.hariKirim.map((h) => (h.hari === hari ? { hari, persiapan } : h)),
    });
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {bidangAwal}
        <div className={kelasLabel}>
          <span id={`${id}-pola`}>Pola</span>
          <Select value={isian.pola} onValueChange={(nilai) => ubah({ pola: nilai as PolaJadwal })} disabled={nonaktif}>
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

      <fieldset className="flex flex-col gap-2" disabled={nonaktif}>
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
                  disabled={nonaktif || persiapan === undefined}
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
            disabled={nonaktif}
          />
          <span className="font-normal text-muted-foreground">
            Pekan (Senin–Minggu) yang memuat tanggal ini menjadi pekan kirim, lalu berulang setiap 14 hari.
          </span>
        </label>
      ) : null}
    </>
  );
}
