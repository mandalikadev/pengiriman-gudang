"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import * as XLSX from "xlsx";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bulanImporDariNamaSheet } from "@/domain/bulan-impor";

import { daftarkanImpor, mintaUrlUnggah, type HasilDaftarImpor } from "./aksi";
import { PilihanSheet, sheetBisaDipilih } from "./pilihan-sheet";
import { masalahPilihanSheet } from "./validasi-sheet";

const BELUM_ADA_IMPOR = "Belum ada impor yang dibuat; pilih file dan unggah lagi.";

/** Hanya nama sheet yang dibaca di browser; isi sheet dibaca worker setelah file diunggah (ADR-0001). */
async function bacaNamaSheet(file: File): Promise<string[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", bookSheets: true });
  return workbook.SheetNames;
}

/**
 * Unggah workbook sekali langsung ke storage, centang satu atau lebih sheet beserta bulan impornya, lalu antrekan
 * pemrosesan per sheet (issue T11, T85). Hasil per sheet diteruskan ke `onTerkirim`.
 */
export function FormUnggahImpor({ onTerkirim }: { onTerkirim: (hasil: HasilDaftarImpor) => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [daftarSheet, setDaftarSheet] = useState<string[] | null>(null);
  const [galatBaca, setGalatBaca] = useState<string | null>(null);
  const [terpilih, setTerpilih] = useState<Record<string, string>>({});
  const [tahun, setTahun] = useState("");
  const [galatIsian, setGalatIsian] = useState<string | null>(null);
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilDaftarImpor>("daftar impor di bawah");

  function ubah() {
    tandaiBerubah();
    setGalatIsian(null);
  }

  async function pilihFile(baru: File | null) {
    ubah();
    setFile(baru);
    setDaftarSheet(null);
    setTerpilih({});
    setGalatBaca(null);
    if (!baru) return;
    try {
      setDaftarSheet(await bacaNamaSheet(baru));
    } catch {
      setGalatBaca("File ini tidak bisa dibaca sebagai workbook Excel. Pilih file .xlsx yang benar.");
    }
  }

  function centang(nama: string, dicentang: boolean) {
    ubah();
    setTerpilih((lama) => {
      const baru = { ...lama };
      delete baru[nama];
      if (dicentang && sheetBisaDipilih(nama)) {
        const bulan = bulanImporDariNamaSheet(nama);
        baru[nama] = bulan === null ? "" : String(bulan);
      }
      return baru;
    });
  }

  function pilihBulan(nama: string, bulan: string) {
    ubah();
    setTerpilih((lama) => (nama in lama ? { ...lama, [nama]: bulan } : lama));
  }

  // Urutan sheet mengikuti urutan di workbook.
  const sheetTerpilih = (daftarSheet ?? [])
    .filter((nama) => nama in terpilih)
    .map((nama) => ({ namaSheet: nama, bulanImpor: terpilih[nama] === "" ? null : Number(terpilih[nama]) }));
  const sudahTerkirim = hasil !== null && hasil.keadaan !== "gagal";

  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!file) return;
          const masalah = masalahPilihanSheet({ tahunImpor: tahun, sheet: sheetTerpilih });
          setGalatIsian(masalah);
          if (masalah) return;
          const sheet = sheetTerpilih.flatMap(({ namaSheet, bulanImpor }) => (bulanImpor === null ? [] : [{ namaSheet, bulanImpor }]));
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
            const hasilDaftar = await daftarkanImpor({ kunci: minta.kunci, namaFile: file.name, tahunImpor: Number(tahun), sheet });
            if (hasilDaftar.sheet) {
              onTerkirim(hasilDaftar);
              router.refresh();
            }
            return hasilDaftar;
          });
        }}
      >
        <CardHeader>
          <CardTitle>Unggah workbook penjualan</CardTitle>
          <CardDescription>
            Pilih file Excel, centang satu atau lebih sheet penjualan, lalu periksa bulan impor setiap sheet. File
            diunggah sekali; setiap sheet menjadi impor tersendiri yang dibaca dan divalidasi di server. Anda boleh
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
            <div className="max-w-xl">
              <PilihanSheet daftarSheet={daftarSheet} terpilih={terpilih} onCentang={centang} onPilihBulan={pilihBulan} />
            </div>
          ) : null}

          <label className="flex max-w-56 flex-col gap-2 font-semibold">
            Tahun impor
            <Input
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="mis. 2026"
              value={tahun}
              onChange={(e) => {
                setTahun(e.target.value.trim());
                ubah();
              }}
            />
            <span className="font-normal text-muted-foreground">Berlaku untuk semua sheet terpilih.</span>
          </label>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || file === null || sudahTerkirim} className="active:scale-95">
            Unggah dan proses
          </Button>
          {galatIsian ? (
            <PesanStatusSimpan keadaan="gagal" pesan={galatIsian} />
          ) : tampilan ? (
            <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} />
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}
