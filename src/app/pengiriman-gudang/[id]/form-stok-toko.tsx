"use client";

import { CircleX } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { simpanStok } from "./aksi-stok";
import { STOK_MAKS } from "./batas-stok";
import { bacaIsianLokal, kunciIsianLokal, langgananIsianLokal, tulisIsianLokal } from "./isian-lokal";
import { usePeringatanTinggalkan } from "./perlindungan-draft";

// Form stok akhir satu toko di draft rencana (T59; PRD A6, A7). Isian kosong = belum diketahui (`null`), bukan nol; stok
// negatif boleh. Simpan per toko dengan lima keadaan (CODING_STANDARDS); hasil belum pasti tidak diulang otomatis.
// Perlindungan draft: isian yang belum disimpan disimpan di penyimpanan lokal peramban dan dipulihkan setelah muat ulang
// atau gangguan akses, sampai berhasil disimpan; meninggalkan halaman memunculkan peringatan.

const PESAN_ISIAN_TIDAK_VALID = "Isi bilangan bulat, atau kosongkan jika belum diketahui.";

type StokTersimpan = { kodeProduk: string; stokAkhir: number | null };

/** Isian teks → stok akhir: kosong = `null` (belum diketahui); `undefined` = bukan bilangan bulat yang diterima. */
function bacaIsianStok(teks: string): number | null | undefined {
  const rapi = teks.trim().replace(/^[−–]/, "-");
  if (rapi === "") return null;
  if (!/^-?\d+$/.test(rapi)) return undefined;
  const nilai = Number(rapi);
  return Math.abs(nilai) <= STOK_MAKS ? nilai : undefined;
}

const teksStok = (stokAkhir: number | null) => (stokAkhir === null ? "" : String(stokAkhir));

/** Isian lokal (JSON) → isian per kode produk, hanya untuk varian yang ada di draft. */
function uraiIsianLokal(teks: string | null, kodeDraft: ReadonlySet<string>): Record<string, string> {
  if (teks === null) return {};
  try {
    const isi: unknown = JSON.parse(teks);
    if (typeof isi !== "object" || isi === null || Array.isArray(isi)) return {};
    return Object.fromEntries(
      Object.entries(isi).filter((e): e is [string, string] => kodeDraft.has(e[0]) && typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
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

  function ubah(kodeProduk: string, nilai: string) {
    const baru = { ...isian, [kodeProduk]: nilai };
    const berubah = Object.fromEntries(Object.entries(baru).filter(([k, v]) => v !== tersimpan[k]));
    tulisIsianLokal(kunci, Object.keys(berubah).length > 0 ? berubah : null);
    tandaiBerubah();
  }

  const tidakValid = berbeda.filter((k) => bacaIsianStok(isian[k]) === undefined);

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
        {children}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={menunggu || !belumDisimpan} className="active:scale-95">
            Simpan stok
          </Button>
          {keadaan ? <PesanStatusSimpan keadaan={keadaan.keadaan} pesan={keadaan.pesan} /> : null}
        </div>
      </form>
    </Konteks.Provider>
  );
}

/** Isian stok akhir satu varian di dalam `FormStokToko`. Kosong tampil "—" dengan status belum diketahui (DESIGN §7). */
export function InputStok({ kodeProduk }: { kodeProduk: string }) {
  const konteks = useContext(Konteks);
  if (konteks === null) throw new Error("InputStok harus berada di dalam FormStokToko.");
  const nilai = konteks.isian[kodeProduk] ?? "";
  const salah = bacaIsianStok(nilai) === undefined;
  const idPesan = `stok-salah-${kodeProduk}`;
  return (
    <div className="flex flex-col items-end gap-1">
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
      {salah ? (
        <p id={idPesan} className="flex items-start gap-1 text-left">
          <CircleX aria-hidden strokeWidth={2} className="size-5 shrink-0 text-destructive" />
          {PESAN_ISIAN_TIDAK_VALID}
        </p>
      ) : nilai.trim() === "" ? (
        <BadgeStatus status="belumDiketahui" />
      ) : null}
    </div>
  );
}
