"use client";

import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";

import { tugaskanOperator } from "./aksi";
import { PilihanHakTindakan } from "./pilihan-hak-tindakan";

export type PilihanPengguna = { id: string; nama: string; email: string; nonaktif: boolean };
export type PilihanGudang = { id: number; nama: string };

function labelPengguna(p: PilihanPengguna) {
  return `${p.nama} (${p.email})${p.nonaktif ? " — nonaktif" : ""}`;
}

/** Menugaskan satu pengguna ke satu gudang dengan hak tindakan pilihan (PRD A3). */
export function FormTugaskanOperator({
  daftarPengguna,
  daftarGudang,
}: {
  daftarPengguna: PilihanPengguna[];
  daftarGudang: PilihanGudang[];
}) {
  const id = useId();
  const [idPengguna, setIdPengguna] = useState("");
  const [idGudang, setIdGudang] = useState("");
  const [hakTindakan, setHakTindakan] = useState<HakTindakan[]>([]);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar penugasan");
  const pengguna = daftarPengguna.find((p) => p.id === idPengguna);
  const namaGudang = daftarGudang.find((g) => String(g.id) === idGudang)?.nama;

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          simpan(
            () => tugaskanOperator({ idPengguna, idGudang: Number(idGudang), hakTindakan }),
            () => {
              setIdPengguna("");
              setIdGudang("");
              setHakTindakan([]);
            },
          );
        }}
      >
        <CardHeader>
          <CardTitle>Tugaskan operator</CardTitle>
          <CardDescription>
            Pengguna menjadi operator hanya di gudang yang ditugaskan, dengan hak tindakan yang dipilih. Peran admin
            tidak memberi hak operator.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 font-semibold">
              <span id={`${id}-pengguna`}>Pengguna</span>
              <Select
                value={idPengguna}
                onValueChange={(nilai) => {
                  setIdPengguna(nilai);
                  tandaiBerubah();
                }}
              >
                <SelectTrigger aria-labelledby={`${id}-pengguna`}>
                  <SelectValue placeholder="Pilih pengguna">{pengguna ? labelPengguna(pengguna) : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {daftarPengguna.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {labelPengguna(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 font-semibold">
              <span id={`${id}-gudang`}>Gudang</span>
              <Select
                value={idGudang}
                onValueChange={(nilai) => {
                  setIdGudang(nilai);
                  tandaiBerubah();
                }}
              >
                <SelectTrigger aria-labelledby={`${id}-gudang`}>
                  <SelectValue placeholder="Pilih gudang">{namaGudang}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {daftarGudang.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold">Hak tindakan</span>
            <PilihanHakTindakan
              judul="Hak tindakan"
              nilai={hakTindakan}
              onUbah={(nilai) => {
                setHakTindakan(nilai);
                tandaiBerubah();
              }}
            />
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || !idPengguna || !idGudang} className="active:scale-95">
            Tugaskan
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
