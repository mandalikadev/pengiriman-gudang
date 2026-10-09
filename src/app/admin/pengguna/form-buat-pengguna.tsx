"use client";

import { useId, useState } from "react";

import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { buatPengguna } from "./aksi";
import { usePenyimpanan } from "./keadaan-simpan";

const isianKosong = { nama: "", email: "", sandi: "", peran: "viewer" };

export function FormBuatPengguna() {
  const id = useId();
  const [isian, setIsian] = useState(isianKosong);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan();

  function ubah(kolom: keyof typeof isianKosong, nilai: string) {
    setIsian((sebelumnya) => ({ ...sebelumnya, [kolom]: nilai }));
    tandaiBerubah();
  }

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          simpan(() => buatPengguna(isian), () => setIsian(isianKosong));
        }}
      >
        <CardHeader>
          <CardTitle>Buat pengguna</CardTitle>
          <CardDescription>Akun dibuat admin. Pengguna masuk dengan email dan kata sandi ini.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-nama`}>
            Nama
            <Input id={`${id}-nama`} required autoComplete="off" value={isian.nama} onChange={(e) => ubah("nama", e.target.value)} />
          </label>
          <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-email`}>
            Email
            <Input
              id={`${id}-email`}
              type="email"
              required
              autoComplete="off"
              value={isian.email}
              onChange={(e) => ubah("email", e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-sandi`}>
            Kata sandi
            <Input
              id={`${id}-sandi`}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              aria-describedby={`${id}-sandi-keterangan`}
              value={isian.sandi}
              onChange={(e) => ubah("sandi", e.target.value)}
            />
            <span id={`${id}-sandi-keterangan`} className="text-sm font-normal text-muted-foreground">
              Minimal 8 karakter.
            </span>
          </label>
          <div className="flex flex-col gap-2 font-semibold">
            <span id={`${id}-peran`}>Peran</span>
            <Select value={isian.peran} onValueChange={(nilai) => ubah("peran", nilai)}>
              <SelectTrigger aria-labelledby={`${id}-peran`}>
                <SelectValue>{isian.peran}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">viewer</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu} className="active:scale-95">
            Buat pengguna
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
