"use client";

import { useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import { unggahTabelAlias, type HasilUnggahAlias } from "./aksi";
import { HasilUnggahan } from "./hasil-unggahan";

/** Unggah tabel alias (CSV `;` atau `.xlsx`, maks. 1 MB) langsung ke server action; hasil per baris tampil di bawahnya. */
export function FormUnggahAlias() {
  const [file, setFile] = useState<File | null>(null);
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilUnggahAlias>("daftar alias di bawah");

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!file) return;
          const form = new FormData();
          form.set("file", file);
          simpan(() => unggahTabelAlias(form));
        }}
      >
        <CardHeader>
          <CardTitle>Unggah tabel alias</CardTitle>
          <CardDescription>
            File CSV berpemisah titik koma (;) atau Excel (.xlsx, sheet pertama), maksimal 1 MB. Baris pertama berisi
            judul kolom <span className="font-semibold">Nama di file stok</span> dan{" "}
            <span className="font-semibold">Kode produk</span>; kolom lain diabaikan. Baris yang ditolak tidak menahan
            baris lain.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <label className="flex max-w-xl flex-col gap-2 font-semibold">
            File tabel alias
            <input
              type="file"
              name="file"
              accept=".csv,.xlsx"
              className="text-sm font-normal file:mr-4 file:h-10 file:cursor-pointer file:rounded-full file:border-2 file:border-primary file:bg-transparent file:px-5 file:font-semibold file:text-primary"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                tandaiBerubah();
              }}
            />
          </label>
          {hasil && hasil.keadaan !== "gagal" ? <HasilUnggahan baris={hasil.baris} jumlah={hasil.jumlah} /> : null}
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || file === null} className="active:scale-95">
            Unggah tabel alias
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
