"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { setujuiUsulan, tolakUsulan } from "./aksi";

/**
 * Setujui atau Tolak (dengan alasan) satu usulan jadwal (T56). Peran admin dan alasan wajib diperiksa lagi di server.
 * Keputusan yang hasilnya belum pasti tidak diulang otomatis (usePenyimpanan).
 */
export function TindakanUsulan({ idUsulan, toko }: { idUsulan: number; toko: string }) {
  const id = useId();
  const [alasan, setAlasan] = useState("");
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar usulan di halaman ini");
  const sudahDiputuskan = hasil !== null && hasil.keadaan !== "gagal";
  const terkunci = menunggu || sudahDiputuskan;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Button
          type="button"
          disabled={terkunci}
          className="active:scale-95"
          onClick={() => simpan(() => setujuiUsulan({ idUsulan }))}
        >
          Setujui<span className="sr-only"> usulan jadwal {toko}</span>
        </Button>
        <form
          className="flex flex-wrap items-end gap-4"
          aria-label={`Tolak usulan jadwal ${toko}`}
          onSubmit={(event) => {
            event.preventDefault();
            simpan(() => tolakUsulan({ idUsulan, alasan }));
          }}
        >
          <label className="flex min-w-64 flex-col gap-2 font-semibold" htmlFor={`${id}-alasan`}>
            Alasan penolakan
            <Input
              id={`${id}-alasan`}
              name="alasan"
              required
              value={alasan}
              disabled={terkunci}
              onChange={(e) => {
                setAlasan(e.target.value);
                tandaiBerubah();
              }}
            />
          </label>
          <Button type="submit" variant="destructive" disabled={terkunci || alasan.trim() === ""} className="active:scale-95">
            Tolak
          </Button>
        </form>
      </div>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </div>
  );
}
