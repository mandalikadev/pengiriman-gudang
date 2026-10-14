"use client";

import { CircleX } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

import { formatAngka } from "@/app/admin/impor/format";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STOK_MAKS } from "@/domain/batas-stok";

import { simpanStok } from "./aksi-stok";
import { bacaIsianLokal, kunciIsianLokal, langgananIsianLokal, teksStok, tulisIsianLokal, uraiIsianLokal } from "./isian-lokal";
import { usePeringatanTinggalkan } from "./perlindungan-draft";
import { IkonStokKosong } from "./stok-kosong";
import { UnggahStok } from "./unggah-stok";

// Form stok akhir satu toko di draft rencana (T59; PRD A6, A7). Isian kosong = belum diketahui (`null`), bukan nol; stok
// negatif boleh. Simpan per toko dengan lima keadaan (CODING_STANDARDS); hasil belum pasti tidak diulang otomatis.
// Perlindungan draft: isian yang belum disimpan disimpan di penyimpanan lokal peramban dan dipulihkan setelah muat ulang
// atau gangguan akses, sampai berhasil disimpan; meninggalkan halaman memunculkan peringatan.
// Unggah file stok (T83): hasil terisi diterapkan lewat jalur isian yang sama dengan mengetik (`ubahBanyak`).
// Isi 0 untuk stok yang kosong (T90; PRD A6 ▶ Keputusan 2026-10-12, UAT kedua): tindakan eksplisit operator yang mengisi 0
// lewat jalur yang sama, hanya pada produk otomatis yang isiannya masih kosong. Stok kosong tetap berarti belum diketahui.
// Meja kerja ringkas (T117; DESIGN §11.4): status simpan, jumlah isian yang berubah, dan tombol Simpan stok berada di bar
// aksi yang menempel di bawah layar; isian yang tersembunyi oleh filter tampilan tetap ikut tersimpan.

const PESAN_ISIAN_TIDAK_VALID = "Isi bilangan bulat, atau kosongkan jika belum diketahui.";

type StokTersimpan = { kodeProduk: string; stokAkhir: number | null; klasifikasi: "manual" | "otomatis" };

/** Isian teks → stok akhir: kosong = `null` (belum diketahui); `undefined` = bukan bilangan bulat yang diterima. */
function bacaIsianStok(teks: string): number | null | undefined {
  const rapi = teks.trim().replace(/^[−–]/, "-");
  if (rapi === "") return null;
  if (!/^-?\d+$/.test(rapi)) return undefined;
  const nilai = Number(rapi);
  return Math.abs(nilai) <= STOK_MAKS ? nilai : undefined;
}

type KonteksStok = {
  isian: Readonly<Record<string, string>>;
  ubah: (kodeProduk: string, nilai: string) => void;
  menunggu: boolean;
};

const Konteks = createContext<KonteksStok | null>(null);

/**
 * Pembungkus tabel varian satu toko: mengelola isian stok (termasuk isian lokal yang belum disimpan) dan menampilkan
 * tombol Simpan stok beserta status simpannya. Isian per varian memakai `InputStok` di dalam `children`.
 */
export function FormStokToko({
  idGudang,
  tanggalKirim,
  tokoId,
  namaToko,
  stokTersimpan,
  children,
}: {
  idGudang: number;
  tanggalKirim: string;
  tokoId: number;
  namaToko: string;
  stokTersimpan: readonly StokTersimpan[];
  children: ReactNode;
}) {
  const router = useRouter();
  const kunci = kunciIsianLokal(idGudang, tanggalKirim, tokoId);
  // Stok yang baru saja berhasil disimpan, hanya berlaku selama data server yang dipakai saat menyimpan (`dasar`) belum
  // berganti. Begitu data server baru tiba (mis. setelah `router.refresh()`), nilai dari server yang dipakai.
  const [baruDisimpan, setBaruDisimpan] = useState<{ dasar: readonly StokTersimpan[]; nilai: Record<string, string> } | null>(null);
  const tersimpan: Record<string, string> = {
    ...Object.fromEntries(stokTersimpan.map((s) => [s.kodeProduk, teksStok(s.stokAkhir)])),
    ...(baruDisimpan?.dasar === stokTersimpan ? baruDisimpan.nilai : {}),
  };
  // Isian lokal dibaca setelah hidrasi (server dan render pertama memakai nilai tersimpan).
  const teksLokal = useSyncExternalStore(
    langgananIsianLokal,
    () => bacaIsianLokal(kunci),
    () => null,
  );
  const isian = { ...tersimpan, ...uraiIsianLokal(teksLokal, new Set(Object.keys(tersimpan))) };
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("stok toko ini");

  const berbeda = stokTersimpan.map((s) => s.kodeProduk).filter((k) => isian[k] !== tersimpan[k]);
  const belumDisimpan = berbeda.length > 0;
  usePeringatanTinggalkan(belumDisimpan);
  // "Belum disimpan" mengikuti isian yang memang berbeda dari stok tersimpan, termasuk isian yang baru dipulihkan.
  const keadaan =
    tampilan !== null && tampilan.keadaan !== "belumDisimpan" ? tampilan : belumDisimpan ? { keadaan: "belumDisimpan" as const } : null;

  /** Mengubah isian beberapa varian sekaligus; kode yang bukan varian toko ini di draft diabaikan. */
  function ubahBanyak(perubahan: Readonly<Record<string, string>>) {
    const baru = { ...isian, ...Object.fromEntries(Object.entries(perubahan).filter(([k]) => Object.hasOwn(tersimpan, k))) };
    const berubah = Object.fromEntries(Object.entries(baru).filter(([k, v]) => v !== tersimpan[k]));
    tulisIsianLokal(kunci, Object.keys(berubah).length > 0 ? berubah : null);
    tandaiBerubah();
  }

  function ubah(kodeProduk: string, nilai: string) {
    ubahBanyak({ [kodeProduk]: nilai });
  }

  const tidakValid = berbeda.filter((k) => bacaIsianStok(isian[k]) === undefined);
  const otomatisKosong = stokTersimpan
    .filter((s) => s.klasifikasi === "otomatis" && bacaIsianStok(isian[s.kodeProduk]) === null)
    .map((s) => s.kodeProduk);

  return (
    <Konteks.Provider value={{ isian, ubah, menunggu }}>
      <form
        aria-label={`Stok akhir ${namaToko}`}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (tidakValid.length > 0) {
            simpan(async () => ({ keadaan: "gagal", pesan: "Perbaiki isian stok yang ditandai." }));
            return;
          }
          const stok = berbeda.map((k) => ({ kodeProduk: k, stokAkhir: bacaIsianStok(isian[k]) ?? null }));
          simpan(
            () => simpanStok({ idGudang, tanggalKirim, tokoId, stok }),
            () => {
              setBaruDisimpan((lama) => ({
                dasar: stokTersimpan,
                nilai: {
                  ...(lama?.dasar === stokTersimpan ? lama.nilai : {}),
                  ...Object.fromEntries(stok.map((s) => [s.kodeProduk, teksStok(s.stokAkhir)])),
                },
              }));
              tulisIsianLokal(kunci, null);
              router.refresh();
            },
          );
        }}
      >
        <UnggahStok
          idGudang={idGudang}
          tanggalKirim={tanggalKirim}
          tokoId={tokoId}
          menunggu={menunggu}
          terapkan={(terisi) => ubahBanyak(Object.fromEntries(terisi.map((s) => [s.kodeProduk, teksStok(s.stokAkhir)])))}
        />
        <Button
          type="button"
          variant="outline"
          disabled={menunggu || otomatisKosong.length === 0}
          onClick={() => ubahBanyak(Object.fromEntries(otomatisKosong.map((k) => [k, "0"])))}
          className="self-start active:scale-95"
        >
          {`Isi 0 untuk ${formatAngka(otomatisKosong.length)} stok yang kosong`}
        </Button>
        {children}
        <div
          data-bar-aksi-stok
          className="sticky bottom-0 z-35 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 bg-card/95 py-3 backdrop-blur-md"
        >
          {keadaan ? <PesanStatusSimpan keadaan={keadaan.keadaan} pesan={keadaan.pesan} /> : null}
          {belumDisimpan ? (
            <span data-jumlah-isian-berubah={berbeda.length} className="text-sm text-muted-foreground tabular-nums">
              {`${formatAngka(berbeda.length)} isian berubah`}
            </span>
          ) : null}
          <Button type="submit" disabled={menunggu || !belumDisimpan} className="ml-auto active:scale-95">
            Simpan stok
          </Button>
        </div>
      </form>
    </Konteks.Provider>
  );
}

/**
 * Isian stok akhir satu varian di dalam `FormStokToko`. Kosong tampil "—" dengan ikon belum diketahui di sampingnya, tanpa
 * badge bertumpuk (DESIGN §7, §11.4).
 */
export function InputStok({ kodeProduk }: { kodeProduk: string }) {
  const konteks = useContext(Konteks);
  if (konteks === null) throw new Error("InputStok harus berada di dalam FormStokToko.");
  const nilai = konteks.isian[kodeProduk] ?? "";
  const salah = bacaIsianStok(nilai) === undefined;
  const idPesan = `stok-salah-${kodeProduk}`;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        {nilai.trim() === "" ? <IkonStokKosong /> : null}
        <Input
          ukuran="tabel"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`Stok akhir ${kodeProduk}`}
          aria-invalid={salah || undefined}
          aria-describedby={salah ? idPesan : undefined}
          placeholder="—"
          value={nilai}
          disabled={konteks.menunggu}
          onChange={(event) => konteks.ubah(kodeProduk, event.target.value)}
          className="w-28 text-right tabular-nums"
        />
      </div>
      {salah ? (
        <p id={idPesan} className="flex items-start gap-1 text-left">
          <CircleX aria-hidden strokeWidth={2} className="size-5 shrink-0 text-destructive" />
          {PESAN_ISIAN_TIDAK_VALID}
        </p>
      ) : null}
    </div>
  );
}
