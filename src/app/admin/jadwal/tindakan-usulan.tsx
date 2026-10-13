"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { setujuiPengiriman, tolakPengiriman } from "./aksi";

/**
 * Setujui atau Tolak (dengan alasan) satu usulan pengiriman di luar jadwal (T113). Peran admin, syarat, dan alasan wajib
 * diperiksa lagi di server. Keputusan yang hasilnya belum pasti tidak diulang otomatis (usePenyimpanan).
 */
export function TindakanUsulan({ id, toko }: { id: number; toko: string }) {
  const idAlasan = useId();
  const [alasan, setAlasan] = useState("");
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar usulan di halaman ini");
  const sudahDiputuskan = hasil !== null && hasil.keadaan !== "gagal";
  const terkunci = menunggu || sudahDiputuskan;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Button type="button" disabled={terkunci} className="active:scale-95" onClick={() => simpan(() => setujuiPengiriman({ id }))}>
          Setujui<span className="sr-only"> usulan pengiriman {toko}</span>
        </Button>
        <form
          className="flex flex-wrap items-end gap-4"
          aria-label={`Tolak usulan pengiriman ${toko}`}
          onSubmit={(event) => {
            event.preventDefault();
            simpan(() => tolakPengiriman({ id, alasan }));
          }}
        >
          <label className="flex min-w-64 flex-col gap-2 font-semibold" htmlFor={idAlasan}>
            Alasan penolakan
            <Input
              id={idAlasan}
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
