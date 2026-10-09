"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import * as XLSX from "xlsx";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { daftarkanImpor, mintaUrlUnggah, type HasilDaftarImpor } from "./aksi";
import { NAMA_BULAN } from "./format";
import { PilihanSheet, sheetBisaDipilih } from "./pilihan-sheet";

const BELUM_ADA_IMPOR = "Belum ada impor yang dibuat; pilih file dan unggah lagi.";

/** Hanya nama sheet yang dibaca di browser; isi sheet dibaca worker setelah file diunggah (ADR-0001). */
async function bacaNamaSheet(file: File): Promise<string[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", bookSheets: true });
  return workbook.SheetNames;
}

/** Unggah workbook langsung ke storage, pilih sheet dan bulan impor, lalu antrekan pemrosesannya (issue T11). */
export function FormUnggahImpor() {
  const id = useId();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [daftarSheet, setDaftarSheet] = useState<string[] | null>(null);
  const [galatBaca, setGalatBaca] = useState<string | null>(null);
  const [sheet, setSheet] = useState("");
  const [tahun, setTahun] = useState("");
  const [bulan, setBulan] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilDaftarImpor>("daftar impor di bawah");

  async function pilihFile(baru: File | null) {
    tandaiBerubah();
    setFile(baru);
    setDaftarSheet(null);
    setSheet("");
    setGalatBaca(null);
    if (!baru) return;
    try {
      setDaftarSheet(await bacaNamaSheet(baru));
    } catch {
      setGalatBaca("File ini tidak bisa dibaca sebagai workbook Excel. Pilih file .xlsx yang benar.");
    }
  }

  const siap = file !== null && sheetBisaDipilih(sheet) && sheet !== "" && /^\d{4}$/.test(tahun) && bulan !== "";

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!file || !siap) return;
          simpan(async (): Promise<HasilDaftarImpor> => {
            const minta = await mintaUrlUnggah();
            if (minta.keadaan === "gagal") return minta;
            let jawaban: Response;
            try {
              jawaban = await fetch(minta.url, { method: "PUT", body: file });
            } catch {
              return { keadaan: "gagal", pesan: `Unggahan ke storage terputus. ${BELUM_ADA_IMPOR}` };
            }
            if (!jawaban.ok) {
              return { keadaan: "gagal", pesan: `Storage menolak unggahan (kode ${jawaban.status}). ${BELUM_ADA_IMPOR}` };
            }
            const hasil = await daftarkanImpor({
              kunci: minta.kunci,
              namaFile: file.name,
              namaSheet: sheet,
              tahunImpor: Number(tahun),
              bulanImpor: Number(bulan),
            });
            if (hasil.keadaan === "berhasil") router.push(`/admin/impor/${hasil.idImpor}`);
            return hasil;
          });
        }}
      >
        <CardHeader>
          <CardTitle>Unggah workbook penjualan</CardTitle>
          <CardDescription>
            Pilih file Excel, sheet penjualan, dan bulan impornya. File dibaca dan divalidasi di server; Anda boleh
            menutup tab selama proses berjalan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <label className="flex max-w-xl flex-col gap-2 font-semibold">
            File Excel
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls"
              className="text-sm font-normal file:mr-4 file:h-10 file:cursor-pointer file:rounded-full file:border-2 file:border-primary file:bg-transparent file:px-5 file:font-semibold file:text-primary"
              onChange={(e) => void pilihFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {galatBaca ? <PesanStatusSimpan keadaan="gagal" pesan={galatBaca} /> : null}
          {daftarSheet ? (
            <PilihanSheet
              daftarSheet={daftarSheet}
              terpilih={sheet}
              onPilih={(nama) => {
                setSheet(nama);
                tandaiBerubah();
              }}
            />
          ) : null}

          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 font-semibold">
              Tahun impor
              <Input
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="mis. 2026"
                value={tahun}
                onChange={(e) => {
                  setTahun(e.target.value.trim());
                  tandaiBerubah();
                }}
              />
            </label>
            <div className="flex flex-col gap-2 font-semibold">
              <span id={`${id}-bulan`}>Bulan impor</span>
              <Select
                value={bulan}
                onValueChange={(nilai) => {
                  setBulan(nilai);
                  tandaiBerubah();
                }}
              >
                <SelectTrigger aria-labelledby={`${id}-bulan`}>
                  <SelectValue placeholder="Pilih bulan">{bulan ? NAMA_BULAN[Number(bulan) - 1] : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {NAMA_BULAN.map((nama, i) => (
                    <SelectItem key={nama} value={String(i + 1)}>
                      {nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || !siap} className="active:scale-95">
            Unggah dan proses
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
