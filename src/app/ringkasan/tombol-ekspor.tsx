"use client";

import { CircleX, Download, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Tombol Ekspor Ringkasan (T38). Berkas diminta lewat fetch agar keadaan sedang mengekspor dan gagal terlihat dekat
// tombolnya (DESIGN §7: ikon + teks). Kewenangan diperiksa di route handler, bukan di sini.

const PESAN_TERPUTUS = "Server tidak menjawab atau koneksi terputus. Coba ekspor lagi.";

type JawabanEkspor = { keadaan: "berhasil"; berkas: Blob; namaBerkas: string } | { keadaan: "gagal"; pesan: string };

/** Membaca jawaban `GET /ringkasan/ekspor`: berkas beserta namanya, atau pesan gagal dari server. */
export async function bacaJawabanEkspor(jawaban: Response): Promise<JawabanEkspor> {
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
  const namaBerkas = /filename="([^"]+)"/.exec(jawaban.headers.get("content-disposition") ?? "")?.[1] ?? "ringkasan.xlsx";
  return { keadaan: "berhasil", berkas: await jawaban.blob(), namaBerkas };
}

type KeadaanEkspor = { keadaan: "siap" } | { keadaan: "mengekspor" } | { keadaan: "gagal"; pesan: string };

/** Pesan keadaan ekspor di samping tombol: sedang mengekspor (info) atau gagal (destructive). */
export function StatusEkspor({ keadaan }: { keadaan: KeadaanEkspor }) {
  if (keadaan.keadaan === "siap") return null;
  const mengekspor = keadaan.keadaan === "mengekspor";
  const Ikon = mengekspor ? LoaderCircle : CircleX;
  return (
    <p
      role={mengekspor ? "status" : "alert"}
      data-keadaan-ekspor={keadaan.keadaan}
      className="flex items-start gap-2 text-sm font-semibold text-foreground"
    >
      <Ikon
        aria-hidden
        strokeWidth={2}
        className={cn("size-5 shrink-0", mengekspor ? "text-info motion-safe:animate-spin" : "text-destructive")}
      />
      <span>
        {mengekspor ? "Sedang mengekspor" : "Gagal mengekspor"}
        {keadaan.keadaan === "gagal" ? <span className="font-normal"> — {keadaan.pesan}</span> : null}
      </span>
    </p>
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
