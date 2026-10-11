"use client";

import { CircleCheck, CircleMinus, CircleX, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";

import { formatAngka } from "@/app/admin/impor/format";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { unggahStok, type HasilUnggahStok } from "./aksi-stok";

// Unggah file stok satu toko di draft rencana (T83; PRD A6 ▶ Keputusan 2026-10-12, UAT; CONTEXT "Unggah stok"). File
// dibaca di server action tanpa menyimpan stok; hasil terisi diterapkan ke isian stok lewat `terapkan` (jalur yang sama
// dengan mengetik), sehingga "Belum disimpan" dan perlindungan draft berlaku. Ringkasan hasil hanya hidup di memori
// komponen: hilang saat halaman dimuat ulang. Zona kerja; status ikon + teks (DESIGN §7).

const PESAN_BELUM_PASTI = "File tidak terbaca karena server tidak menjawab. Coba lagi.";

type Terisi = Extract<HasilUnggahStok, { keadaan: "berhasil" }>;

/** Ringkasan hasil unggahan: jumlah terisi selalu tampil; kelompok lain tampil bila ada isinya. */
function RingkasanUnggahStok({ hasil }: { hasil: Terisi }) {
  const { terisi, tidakDikenal, jumlahDiabaikan, tidakValid } = hasil;
  return (
    <section aria-label="Hasil unggahan file stok" data-hasil-unggahan className="flex flex-col gap-2">
      <p data-jumlah-terisi={terisi.length} className="flex items-start gap-2 font-semibold">
        {terisi.length > 0 ? (
          <CircleCheck aria-hidden strokeWidth={2} className="size-5 shrink-0 text-success" />
        ) : (
          <CircleMinus aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
        )}
        {formatAngka(terisi.length)} varian terisi dari file
      </p>
      {tidakDikenal.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p data-jumlah-tidak-dikenal={tidakDikenal.length} className="flex items-start gap-2 font-semibold">
            <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
            {formatAngka(tidakDikenal.length)} nama tidak dikenal
          </p>
          <ul aria-label="Nama tidak dikenal" className="flex list-disc flex-col pl-12">
            {tidakDikenal.map((nama) => (
              <li key={nama}>{nama}</li>
            ))}
          </ul>
          <p className="pl-7 text-muted-foreground">Admin memetakan nama ini di Alias nama stok.</p>
        </div>
      ) : null}
      {jumlahDiabaikan > 0 ? (
        <p data-jumlah-diabaikan={jumlahDiabaikan} className="flex items-start gap-2 font-semibold">
          <CircleMinus aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
          {formatAngka(jumlahDiabaikan)} baris diabaikan (bukan varian toko ini)
        </p>
      ) : null}
      {tidakValid.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p data-jumlah-tidak-valid={tidakValid.length} className="flex items-start gap-2 font-semibold">
            <CircleX aria-hidden strokeWidth={2} className="size-5 shrink-0 text-destructive" />
            {formatAngka(tidakValid.length)} baris nilai tidak valid
          </p>
          <ul aria-label="Baris nilai tidak valid" className="flex list-disc flex-col pl-12">
            {tidakValid.map((b) => (
              <li key={b.nomor}>
                Baris {formatAngka(b.nomor)}: {b.nama === "" ? "(tanpa nama)" : b.nama} — {b.alasan}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Isian file stok dan tombol Baca file di dalam `FormStokToko`. Tombol bertipe `button` (bukan submit form stok);
 * `menunggu` = form stok sedang menyimpan, saat itu file tidak dibaca.
 */
export function UnggahStok({
  idGudang,
  tanggalKirim,
  tokoId,
  menunggu,
  terapkan,
}: {
  idGudang: number;
  tanggalKirim: string;
  tokoId: number;
  menunggu: boolean;
  terapkan: (terisi: Terisi["terisi"]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [hasil, setHasil] = useState<HasilUnggahStok | null>(null);
  const [membaca, mulai] = useTransition();

  function baca() {
    if (file === null) return;
    const form = new FormData();
    form.set("idGudang", String(idGudang));
    form.set("tanggalKirim", tanggalKirim);
    form.set("tokoId", String(tokoId));
    form.set("file", file);
    mulai(async () => {
      let baru: HasilUnggahStok;
      try {
        baru = await unggahStok(form);
      } catch {
        // Hasil belum pasti tidak diulang otomatis (CODING_STANDARDS); membaca file tidak menulis apa pun.
        baru = { keadaan: "gagal", pesan: PESAN_BELUM_PASTI };
      }
      setHasil(baru);
      if (baru.keadaan === "berhasil") terapkan(baru.terisi);
    });
  }

  return (
    <div data-unggah-stok className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex max-w-xl flex-col gap-2 font-semibold">
          Unggah file stok
          <input
            type="file"
            name="file-stok"
            accept=".csv,.xlsx"
            aria-label="Unggah file stok"
            disabled={membaca || menunggu}
            className="text-sm font-normal file:mr-4 file:h-10 file:cursor-pointer file:rounded-full file:border-2 file:border-primary file:bg-transparent file:px-5 file:font-semibold file:text-primary"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setHasil(null);
            }}
          />
        </label>
        <Button type="button" variant="outline" disabled={file === null || membaca || menunggu} onClick={baca} className="active:scale-95">
          Baca file
        </Button>
        {membaca ? (
          <PesanStatusSimpan keadaan="menyimpan" label="Sedang membaca file" />
        ) : hasil?.keadaan === "gagal" ? (
          <PesanStatusSimpan keadaan="gagal" pesan={hasil.pesan} />
        ) : null}
      </div>
      <p className="text-muted-foreground">
        Ekspor stok akhir kasir untuk toko ini: CSV berpemisah titik koma (;) atau Excel (.xlsx, sheet pertama), maksimal 1 MB,
        dengan judul kolom <span className="font-semibold">Name - Variant</span> dan <span className="font-semibold">Ending</span>.
        Hasilnya mengisi stok di bawah sebagai perubahan yang belum disimpan; periksa, lalu tekan Simpan stok.
      </p>
      {hasil?.keadaan === "berhasil" ? <RingkasanUnggahStok hasil={hasil} /> : null}
    </div>
  );
}
