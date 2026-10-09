"use client";

import { useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan, type KeadaanSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { sinkronkanLiburTahun, type HasilSinkronkanLibur } from "./aksi";

const labelKeadaan: Partial<Record<KeadaanSimpan, string>> = {
  menyimpan: "Sedang menyinkronkan",
  berhasil: "Sinkronisasi berhasil",
  gagal: "Sinkronisasi gagal",
};

/** Pilih tahun lalu sinkronisasi (PRD B2). Hasil disimpan sebagai snapshot menunggu persetujuan. */
export function FormSinkronisasiLibur({ tahunAwal }: { tahunAwal: number }) {
  const [tahun, setTahun] = useState(String(tahunAwal));
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } =
    usePenyimpanan<HasilSinkronkanLibur>("daftar snapshot di bawah");
  const siap = /^\d{4}$/.test(tahun);

  // Mengganti tahun bukan perubahan data, jadi keadaan "belum disimpan" tidak ditampilkan.
  const pesanTampil = tampilan && tampilan.keadaan !== "belumDisimpan" ? tampilan : null;
  const pesanBerhasil =
    hasil && hasil.keadaan !== "gagal"
      ? `${hasil.jumlahLibur} tanggal libur tahun ${hasil.tahun} disimpan sebagai snapshot menunggu persetujuan.`
      : undefined;

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!siap) return;
          simpan(() => sinkronkanLiburTahun({ tahun: Number(tahun) }));
        }}
      >
        <CardHeader>
          <CardTitle>Sinkronisasi libur</CardTitle>
          <CardDescription>
            Ambil daftar libur satu tahun dari API Hari Libur. Hasilnya menunggu persetujuan admin; daftar libur aktif
            tidak berubah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex max-w-48 flex-col gap-2 font-semibold">
            Tahun
            <Input
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={tahun}
              onChange={(e) => {
                setTahun(e.target.value.trim());
                tandaiBerubah();
              }}
            />
          </label>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || !siap} className="active:scale-95">
            Sinkronisasi
          </Button>
          {pesanTampil ? (
            <PesanStatusSimpan
              keadaan={pesanTampil.keadaan}
              label={labelKeadaan[pesanTampil.keadaan]}
              pesan={pesanTampil.pesan ?? pesanBerhasil}
            />
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}
