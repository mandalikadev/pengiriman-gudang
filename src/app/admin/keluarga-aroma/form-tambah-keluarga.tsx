"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { tambahKeluargaAroma } from "./aksi";

export function FormTambahKeluarga() {
  const id = useId();
  const [nama, setNama] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar keluarga aroma");

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          simpan(() => tambahKeluargaAroma({ nama }), () => setNama(""));
        }}
      >
        <CardHeader>
          <CardTitle level={2}>Tambah keluarga aroma</CardTitle>
          <CardDescription>
            Satu keluarga aroma = satu baris file ranking pusat, termasuk kelompok yang bukan aroma seperti GIFT SET BOX.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex max-w-md flex-col gap-2 font-semibold" htmlFor={`${id}-nama`}>
            Nama keluarga
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
            Tambah keluarga
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
