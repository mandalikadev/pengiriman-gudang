"use client";

import { useId } from "react";

import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";

// Label antarmuka untuk hak tindakan PRD A3.
const labelHakTindakan = {
  "kelola-usulan-jadwal": "Kelola usulan jadwal",
  "input-stok": "Input stok",
  "hitung-kebutuhan": "Hitung kebutuhan",
  finalisasi: "Finalisasi",
  ekspor: "Ekspor",
} as const satisfies Record<HakTindakan, string>;

/** Kotak centang hak tindakan. `kunci` menandai penugasan yang diubah (dipakai test dan alat bantu). */
export function PilihanHakTindakan({
  nilai,
  onUbah,
  judul,
  kunci,
}: {
  nilai: readonly HakTindakan[];
  onUbah: (nilai: HakTindakan[]) => void;
  judul: string;
  kunci?: string;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
      <legend className="sr-only">{judul}</legend>
      {daftarHakTindakan.map((hak) => {
        const idKotak = `${id}-${hak}`;
        return (
          <label key={hak} htmlFor={idKotak} className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              id={idKotak}
              type="checkbox"
              className="size-5 cursor-pointer accent-primary"
              data-hak={hak}
              data-penugasan={kunci}
              checked={nilai.includes(hak)}
              onChange={(e) =>
                onUbah(daftarHakTindakan.filter((h) => (h === hak ? e.target.checked : nilai.includes(h))))
              }
            />
            {labelHakTindakan[hak]}
          </label>
        );
      })}
    </fieldset>
  );
}
