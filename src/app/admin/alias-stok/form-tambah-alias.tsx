"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { tambahAliasStok } from "./aksi";

export function FormTambahAlias() {
  const id = useId();
  const [alias, setAlias] = useState("");
  const [kodeProduk, setKodeProduk] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar alias di bawah");

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          simpan(
            () => tambahAliasStok({ alias, kodeProduk }),
            () => {
              setAlias("");
              setKodeProduk("");
            },
          );
        }}
      >
        <CardHeader>
          <CardTitle>Tambah alias</CardTitle>
          <CardDescription>
            Nama produk persis seperti di file stok kasir, dipetakan ke satu kode produk master. Disimpan dalam huruf
            besar dengan spasi dirapikan. Nama master produk sudah berlaku sebagai alias tanpa perlu ditambahkan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-3xl gap-4 sm:grid-cols-[2fr_1fr]">
          <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-alias`}>
            Nama di file stok
            <Input
              id={`${id}-alias`}
              required
              autoComplete="off"
              value={alias}
              onChange={(e) => {
                setAlias(e.target.value);
                tandaiBerubah();
              }}
            />
          </label>
          <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-kode`}>
            Kode produk
            <Input
              id={`${id}-kode`}
              required
              autoComplete="off"
              placeholder="mis. PW110P-GOR"
              value={kodeProduk}
              onChange={(e) => {
                setKodeProduk(e.target.value);
                tandaiBerubah();
              }}
            />
          </label>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu} className="active:scale-95">
            Tambah alias
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
