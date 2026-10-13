"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { tambahGudangBaru } from "./aksi";

/** Form "Tambah gudang" (T110). Nama wajib dan unik; aturan nama diperiksa di server. */
export function FormTambahGudang() {
  const id = useId();
  const [nama, setNama] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar gudang");

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          simpan(() => tambahGudangBaru({ nama }), () => setNama(""));
        }}
      >
        <CardHeader>
          <CardTitle>Tambah gudang</CardTitle>
          <CardDescription>Nama gudang wajib diisi dan tidak boleh sama dengan gudang lain.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex max-w-md flex-col gap-2 font-semibold" htmlFor={`${id}-nama`}>
            Nama gudang
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
            Tambah gudang
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
