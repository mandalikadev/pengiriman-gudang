"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { NAMA_BULAN } from "../impor/format";
import { daftarkanRanking, mintaUrlUnggahRanking, type HasilDaftarRanking } from "./aksi";
import { saranBulanRanking } from "./format";

const BELUM_ADA_RANKING = "Belum ada ranking yang dibuat; pilih file dan unggah lagi.";

/**
 * Unggah file ranking langsung ke storage dan pilih bulan ranking (issue T53). Bulan ranking diisi awal dari nama file
 * bila bisa ditebak, tetap bisa diubah admin (PRD A6 ▶ OD-05).
 */
export function FormUnggahRanking() {
  const id = useId();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [tahun, setTahun] = useState("");
  const [bulan, setBulan] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilDaftarRanking>("daftar ranking di bawah");

  function pilihFile(baru: File | null) {
    tandaiBerubah();
    setFile(baru);
    if (!baru) return;
    const saran = saranBulanRanking(baru.name);
    if (saran.tahun) setTahun(saran.tahun);
    if (saran.bulan) setBulan(saran.bulan);
  }

  const siap = file !== null && /^\d{4}$/.test(tahun) && bulan !== "";

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!file || !siap) return;
          simpan(async (): Promise<HasilDaftarRanking> => {
            const minta = await mintaUrlUnggahRanking();
            if (minta.keadaan === "gagal") return minta;
            let jawaban: Response;
            try {
              jawaban = await fetch(minta.url, { method: "PUT", body: file });
            } catch {
              return { keadaan: "gagal", pesan: `Unggahan ke storage terputus. ${BELUM_ADA_RANKING}` };
            }
            if (!jawaban.ok) {
              return { keadaan: "gagal", pesan: `Storage menolak unggahan (kode ${jawaban.status}). ${BELUM_ADA_RANKING}` };
            }
            const hasil = await daftarkanRanking({
              kunci: minta.kunci,
              namaFile: file.name,
              tahunRanking: Number(tahun),
              bulanRanking: Number(bulan),
            });
            if (hasil.keadaan === "berhasil") router.push(`/admin/ranking/${hasil.idVersi}`);
            return hasil;
          });
        }}
      >
        <CardHeader>
          <CardTitle>Unggah file ranking</CardTitle>
          <CardDescription>
            File Excel dengan sheet RANKING SALES dan kolom RANK, VARIANT, QTY SALES. Bulan ranking diisi dari nama file
            bila bisa ditebak; periksa dan ubah bila perlu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <label className="flex max-w-xl flex-col gap-2 font-semibold">
            File Excel
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls"
              className="text-sm font-normal file:mr-4 file:h-10 file:cursor-pointer file:rounded-full file:border-2 file:border-primary file:bg-transparent file:px-5 file:font-semibold file:text-primary"
              onChange={(e) => pilihFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 font-semibold">
              <span id={`${id}-bulan`}>Bulan ranking</span>
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
            <label className="flex flex-col gap-2 font-semibold">
              Tahun ranking
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
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || !siap} className="active:scale-95">
            Unggah dan tinjau
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
