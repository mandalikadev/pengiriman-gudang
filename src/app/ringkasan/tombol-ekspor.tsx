"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

// Tombol Ekspor Ringkasan (T38). Berkas diminta lewat fetch agar keadaan sedang mengekspor dan gagal terlihat dekat
// tombolnya (DESIGN §7: ikon + teks). Kewenangan diperiksa di route handler, bukan di sini.

const PESAN_TERPUTUS = "Server tidak menjawab atau koneksi terputus. Coba ekspor lagi.";

type JawabanEkspor = { keadaan: "berhasil"; berkas: Blob; namaBerkas: string } | { keadaan: "gagal"; pesan: string };

const JENIS_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PESAN_SESI_BERAKHIR = "Sesi Anda sudah berakhir. Masuk lagi lalu ulangi ekspor.";

/**
 * Membaca jawaban `GET /ringkasan/ekspor`: berkas beserta namanya, atau pesan gagal dari server. Hanya jawaban
 * berjenis .xlsx yang dianggap berkas: tanpa sesi, proxy mengalihkan permintaan ke /masuk (HTML berstatus 200).
 */
export async function bacaJawabanEkspor(jawaban: Response): Promise<JawabanEkspor> {
  if (jawaban.redirected && new URL(jawaban.url).pathname === "/masuk") return { keadaan: "gagal", pesan: PESAN_SESI_BERAKHIR };
  if (!jawaban.ok) {
    let pesan = `Server menolak ekspor (kode ${jawaban.status}).`;
    try {
      const isi: unknown = await jawaban.json();
      if (typeof isi === "object" && isi !== null && "pesan" in isi && typeof isi.pesan === "string") pesan = isi.pesan;
    } catch {
      // Jawaban bukan JSON; pakai pesan kode status.
    }
    return { keadaan: "gagal", pesan };
  }
  if (jawaban.headers.get("content-type") !== JENIS_XLSX) {
    return { keadaan: "gagal", pesan: "Server tidak mengirim berkas .xlsx. Muat ulang halaman lalu ulangi ekspor." };
  }
  const namaBerkas = /filename="([^"]+)"/.exec(jawaban.headers.get("content-disposition") ?? "")?.[1] ?? "ringkasan.xlsx";
  return { keadaan: "berhasil", berkas: await jawaban.blob(), namaBerkas };
}

type KeadaanEkspor = { keadaan: "siap" } | { keadaan: "mengekspor" } | { keadaan: "gagal"; pesan: string };

/** Pesan keadaan ekspor di samping tombol: sedang mengekspor atau gagal (DESIGN §7 lewat PesanStatusSimpan). */
export function StatusEkspor({ keadaan }: { keadaan: KeadaanEkspor }) {
  if (keadaan.keadaan === "siap") return null;
  return keadaan.keadaan === "mengekspor" ? (
    <PesanStatusSimpan keadaan="menyimpan" label="Sedang mengekspor" data-keadaan-ekspor="mengekspor" />
  ) : (
    <PesanStatusSimpan keadaan="gagal" label="Gagal mengekspor" pesan={keadaan.pesan} data-keadaan-ekspor="gagal" />
  );
}

/** `url` = `/ringkasan/ekspor?…` dengan periode dan filter yang sedang diterapkan. */
export function TombolEkspor({ url }: { url: string }) {
  const [keadaan, setKeadaan] = useState<KeadaanEkspor>({ keadaan: "siap" });

  async function ekspor() {
    setKeadaan({ keadaan: "mengekspor" });
    let hasil: JawabanEkspor;
    try {
      hasil = await bacaJawabanEkspor(await fetch(url));
    } catch {
      hasil = { keadaan: "gagal", pesan: PESAN_TERPUTUS };
    }
    if (hasil.keadaan === "gagal") {
      setKeadaan(hasil);
      return;
    }
    const alamat = URL.createObjectURL(hasil.berkas);
    const tautan = document.createElement("a");
    tautan.href = alamat;
    tautan.download = hasil.namaBerkas;
    tautan.click();
    // Dilepas setelah browser mulai mengunduh.
    setTimeout(() => URL.revokeObjectURL(alamat), 1000);
    setKeadaan({ keadaan: "siap" });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 active:scale-95"
        disabled={keadaan.keadaan === "mengekspor"}
        data-ekspor-url={url}
        onClick={() => void ekspor()}
      >
        <Download aria-hidden strokeWidth={2} className="size-5" />
        Ekspor (.xlsx)
      </Button>
      <StatusEkspor keadaan={keadaan} />
    </div>
  );
}
