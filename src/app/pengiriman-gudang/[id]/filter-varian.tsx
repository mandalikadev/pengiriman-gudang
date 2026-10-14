"use client";

import { Search, SearchX } from "lucide-react";
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";

import { formatAngka } from "@/app/admin/impor/format";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Filter tampilan tabel varian satu toko di draft (T117; DESIGN §11.4): Semua · Tertahan · Stok kosong · Jumlah kirim > 0,
// masing-masing dengan jumlahnya, ditambah cari kode atau nama produk. Filter hanya menyembunyikan baris di peramban:
// isian stok, "Isi 0", unggah stok, dan finalisasi tetap berlaku untuk seluruh toko. Penyaring memakai data draft dari
// server (masalah, stok tersimpan, jumlah kirim), sama dengan dasar kolom Masalah dan ringkasan baris tertahan.

/** Data satu baris varian yang dipakai penyaring. */
export type BarisFilter = {
  kodeProduk: string;
  namaProduk: string | null;
  /** Baris punya masalah yang menahan finalisasi. */
  tertahan: boolean;
  /** Stok akhir tersimpan masih kosong (belum diketahui). */
  stokKosong: boolean;
  /** Jumlah kirim lebih dari 0. */
  kirimPositif: boolean;
};

const daftarFilter = [
  { nilai: "semua", label: "Semua", cocok: () => true },
  { nilai: "tertahan", label: "Tertahan", cocok: (b: BarisFilter) => b.tertahan },
  { nilai: "stokKosong", label: "Stok kosong", cocok: (b: BarisFilter) => b.stokKosong },
  { nilai: "kirimPositif", label: "Jumlah kirim > 0", cocok: (b: BarisFilter) => b.kirimPositif },
] as const;

type Filter = (typeof daftarFilter)[number]["nilai"];

type KonteksFilter = {
  baris: readonly BarisFilter[];
  filter: Filter;
  pilihFilter: (filter: Filter) => void;
  cari: string;
  ubahCari: (cari: string) => void;
  /** Kode produk baris yang tampil dengan filter dan pencarian saat ini. */
  tampil: ReadonlySet<string>;
};

const Konteks = createContext<KonteksFilter | null>(null);

function useFilterVarian(): KonteksFilter {
  const konteks = useContext(Konteks);
  if (konteks === null) throw new Error("Komponen filter varian harus berada di dalam FilterVarian.");
  return konteks;
}

function cocokCari(baris: BarisFilter, cari: string) {
  const kata = cari.trim().toLocaleLowerCase("id");
  if (kata === "") return true;
  return [baris.kodeProduk, baris.namaProduk ?? ""].some((t) => t.toLocaleLowerCase("id").includes(kata));
}

/** Pembungkus satu toko yang dibuka: menyimpan filter dan pencarian tabel variannya. */
export function FilterVarian({ baris, children }: { baris: readonly BarisFilter[]; children: ReactNode }) {
  const [filter, pilihFilter] = useState<Filter>("semua");
  const [cari, ubahCari] = useState("");
  const { cocok } = daftarFilter.find((f) => f.nilai === filter) ?? daftarFilter[0];
  const tampil = new Set(baris.filter((b) => cocok(b) && cocokCari(b, cari)).map((b) => b.kodeProduk));
  return <Konteks.Provider value={{ baris, filter, pilihFilter, cari, ubahCari, tampil }}>{children}</Konteks.Provider>;
}

const kelasPilihan =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Pilihan filter beserta jumlah barisnya, dan isian cari kode atau nama produk. */
export function KontrolFilterVarian({ namaToko }: { namaToko: string }) {
  const { baris, filter, pilihFilter, cari, ubahCari } = useFilterVarian();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-label={`Filter baris ${namaToko}`} className="flex flex-wrap gap-2">
        {daftarFilter.map((f) => {
          const terpilih = f.nilai === filter;
          return (
            <button
              key={f.nilai}
              type="button"
              aria-pressed={terpilih}
              data-filter-varian={f.nilai}
              onClick={() => pilihFilter(f.nilai)}
              className={cn(kelasPilihan, terpilih ? "bg-accent text-accent-foreground" : "text-primary hover:bg-primary/10")}
            >
              {f.label}
              <span data-jumlah-filter className="tabular-nums">
                ({formatAngka(baris.filter(f.cocok).length)})
              </span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2">
        <Search aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
        <span className="sr-only">Cari kode atau nama produk</span>
        <Input
          type="search"
          ukuran="tabel"
          autoComplete="off"
          placeholder="Cari kode atau nama produk"
          value={cari}
          onChange={(event) => ubahCari(event.target.value)}
          // Enter di isian cari tidak mengirim form stok di sekelilingnya.
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          className="w-64"
        />
      </label>
    </div>
  );
}

/** Baris tabel varian yang disembunyikan (bukan dibongkar) bila tidak lolos filter, agar isiannya tetap di tempat. */
export function BarisVarian({ kodeProduk, ...props }: ComponentProps<typeof TableRow> & { kodeProduk: string }) {
  const { tampil } = useFilterVarian();
  return <TableRow data-kode-produk={kodeProduk} hidden={!tampil.has(kodeProduk)} {...props} />;
}

/** Keadaan kosong saat tidak ada baris yang lolos filter dan pencarian (ikon + teks, DESIGN §7 dan §11.6). */
export function BarisFilterKosong({ jumlahKolom }: { jumlahKolom: number }) {
  const { tampil, baris } = useFilterVarian();
  if (tampil.size > 0 || baris.length === 0) return null;
  return (
    <TableRow data-filter-kosong>
      <TableCell colSpan={jumlahKolom}>
        <p className="flex items-center gap-2">
          <SearchX aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
          Tidak ada baris yang cocok. Pilih filter Semua atau ubah kata pencarian.
        </p>
      </TableCell>
    </TableRow>
  );
}

const kelasTautan =
  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-primary underline underline-offset-4 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** "Tampilkan baris tertahan": memasang filter Tertahan dan mengosongkan pencarian, lalu membawa tabel ke layar. */
export function TautanTampilkanTertahan({ idTabel }: { idTabel: string }) {
  const { pilihFilter, ubahCari } = useFilterVarian();
  return (
    <button
      type="button"
      data-tampilkan-tertahan
      className={kelasTautan}
      onClick={() => {
        pilihFilter("tertahan");
        ubahCari("");
        document.getElementById(idTabel)?.scrollIntoView?.({ block: "nearest" });
      }}
    >
      Tampilkan baris tertahan
    </button>
  );
}
