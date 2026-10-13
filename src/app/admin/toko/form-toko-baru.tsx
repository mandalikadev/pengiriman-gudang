"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { tambahTokoBaru } from "./aksi";

/** Keterangan aturan nama toko (teks dari issue T111); dipakai form tambah dan halaman Toko. */
export const KETERANGAN_NAMA_TOKO =
  "Nama harus sama persis dengan nama blok toko di sheet penjualan. Setelah nama diubah, sheet berikutnya harus memakai nama baru.";

/** Form "Tambah toko" (T111). Nama wajib dan unik; aturan nama diperiksa di server. */
export function FormTokoBaru() {
  const id = useId();
  const [nama, setNama] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar toko");

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          simpan(() => tambahTokoBaru({ nama }), () => setNama(""));
        }}
      >
        <CardHeader>
          <CardTitle>Tambah toko</CardTitle>
          <CardDescription>{KETERANGAN_NAMA_TOKO}</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex max-w-md flex-col gap-2 font-semibold" htmlFor={`${id}-nama`}>
            Nama toko
            <Input
              id={`${id}-nama`}
              required
              autoComplete="off"
              value={nama}
              onChange={(e) => {
                setNama(e.target.value);
                tandaiBerubah();
              }}
            />
          </label>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu} className="active:scale-95">
            Tambah toko
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
