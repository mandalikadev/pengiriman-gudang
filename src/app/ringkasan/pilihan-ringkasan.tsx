"use client";

import Form from "next/form";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MAKS_BULAN = 12;

const kelasChip =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-4 font-semibold transition-colors duration-300 ease-out hover:bg-primary/10 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40 has-[:focus-visible]:ring-offset-2";

type OpsiProduk = { kode: string; nama: string | null };

/** Pilihan yang sedang dipakai (dari URL). */
type Terapan = { bulan: readonly string[]; toko: readonly string[]; kategoriProduk: readonly string[]; produk: readonly string[] };

function Chip({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked: boolean }) {
  return (
    <label className={kelasChip}>
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="size-4 accent-primary outline-none" />
      {label}
    </label>
  );
}

function Bagian({ judul, keterangan, children }: { judul: string; keterangan?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">{judul}</legend>
      {keterangan ? <p className="text-muted-foreground">{keterangan}</p> : null}
      {children}
    </fieldset>
  );
}

/**
 * Filter produk: cari kode/nama dengan kecocokan teks biasa (bukan fuzzy, PRD C3), banyak pilihan. Produk
 * terpilih selalu tampil; hasil pencarian tampil saat ada teks dicari. Kotak cari tidak ikut ke URL.
 */
function FilterProduk({ opsi, terapan }: { opsi: OpsiProduk[]; terapan: readonly string[] }) {
  const [cari, setCari] = useState("");
  const [terpilih, setTerpilih] = useState(() => new Set(terapan));
  const teks = cari.trim().toLocaleLowerCase("id");
  const hasil =
    teks === ""
      ? []
      : opsi.filter(
          (p) => !terpilih.has(p.kode) && (p.kode.toLocaleLowerCase("id").includes(teks) || (p.nama ?? "").toLocaleLowerCase("id").includes(teks)),
        );
  const daftarTerpilih = opsi.filter((p) => terpilih.has(p.kode));

  function ubah(kode: string, centang: boolean) {
    setTerpilih((lama) => {
      const baru = new Set(lama);
      if (centang) baru.add(kode);
      else baru.delete(kode);
      return baru;
    });
  }

  const pilihan = (p: OpsiProduk) => (
    <label key={p.kode} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 transition-colors duration-300 ease-out hover:bg-primary/10 has-[:checked]:bg-accent has-[:checked]:text-accent-foreground">
      <input
        type="checkbox"
        name="produk"
        value={p.kode}
        checked={terpilih.has(p.kode)}
        onChange={(e) => ubah(p.kode, e.target.checked)}
        className="size-4 accent-primary outline-none"
      />
      <span className="font-semibold">{p.kode}</span>
      {p.nama ? <span>{p.nama}</span> : null}
    </label>
  );

  return (
    <Bagian judul="Produk" keterangan="Cari kode atau nama produk, lalu centang satu atau lebih produk.">
      <div className="max-w-md">
        <Input
          type="search"
          aria-label="Cari kode atau nama produk"
          placeholder="Cari kode atau nama produk"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          onKeyDown={(e) => {
            // Enter di kotak cari tidak menerapkan pilihan; hanya tombol Terapkan.
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      </div>
      {daftarTerpilih.length > 0 ? (
        <div role="group" aria-label="Produk terpilih" className="flex flex-col">
          {daftarTerpilih.map(pilihan)}
        </div>
      ) : null}
      {teks === "" ? null : hasil.length === 0 ? (
        <p aria-live="polite" className="text-muted-foreground">
          Tidak ada produk yang cocok dengan pencarian.
        </p>
      ) : (
        <div role="group" aria-label="Hasil pencarian produk" className="flex max-h-64 flex-col overflow-y-auto rounded-2xl border border-border/60">
          {hasil.map(pilihan)}
        </div>
      )}
    </Bagian>
  );
}

/**
 * Pemilih bulan laporan (1–12, PRD A2) dan filter toko, kategori produk, dan produk (T35). Mengubah pilihan
 * hanya mengubah pilihan yang sedang diedit; hasil baru berubah setelah Terapkan, yang menulis pilihan ke URL
 * (`?bulan=YYYY-MM&toko=<id>&kategoriProduk=…&produk=<kode>`).
 */
export function PilihanRingkasan({
  bulanTersedia,
  opsiFilter,
  terapan,
}: {
  bulanTersedia: { kode: string; label: string }[];
  opsiFilter: { toko: { id: number; nama: string }[]; kategoriProduk: string[]; produk: OpsiProduk[] };
  terapan: Terapan;
}) {
  const id = useId();
  const [terpilih, setTerpilih] = useState(() => new Set(terapan.bulan.filter((b) => bulanTersedia.some((t) => t.kode === b))));
  const jumlah = terpilih.size;
  const sah = jumlah >= 1 && jumlah <= MAKS_BULAN;

  function ubah(kode: string, centang: boolean) {
    setTerpilih((lama) => {
      const baru = new Set(lama);
      if (centang) baru.add(kode);
      else baru.delete(kode);
      return baru;
    });
  }

  return (
    <Card>
      <Form action="/ringkasan" className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle id={`${id}-judul`}>Bulan laporan</CardTitle>
          <CardDescription>Pilih 1–12 bulan, boleh tidak berurutan, lalu tekan Terapkan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <fieldset aria-labelledby={`${id}-judul`} className="flex flex-wrap gap-2">
            {bulanTersedia.map((b) => (
              <label key={b.kode} className={kelasChip}>
                <input
                  type="checkbox"
                  name="bulan"
                  value={b.kode}
                  checked={terpilih.has(b.kode)}
                  onChange={(e) => ubah(b.kode, e.target.checked)}
                  className="size-4 accent-primary outline-none"
                />
                {b.label}
              </label>
            ))}
          </fieldset>
          <Bagian judul="Toko">
            <div className="flex flex-wrap gap-2">
              {opsiFilter.toko.map((t) => (
                <Chip key={t.id} name="toko" value={String(t.id)} label={t.nama} defaultChecked={terapan.toko.includes(String(t.id))} />
              ))}
            </div>
          </Bagian>
          <Bagian judul="Kategori produk">
            <div className="flex flex-wrap gap-2">
              {opsiFilter.kategoriProduk.map((k) => (
                <Chip key={k} name="kategoriProduk" value={k} label={k} defaultChecked={terapan.kategoriProduk.includes(k)} />
              ))}
            </div>
          </Bagian>
          <FilterProduk opsi={opsiFilter.produk} terapan={terapan.produk} />
        </CardContent>
        <CardFooter className="flex-wrap">
          <Button type="submit" disabled={!sah}>
            Terapkan
          </Button>
          <span aria-live="polite" className={sah ? "text-muted-foreground" : "text-foreground"}>
            {jumlah === 0
              ? "Belum ada bulan dipilih."
              : jumlah > MAKS_BULAN
                ? `${jumlah} bulan dipilih. Pilih paling banyak ${MAKS_BULAN} bulan.`
                : `${jumlah} bulan dipilih.`}
          </span>
        </CardFooter>
      </Form>
    </Card>
  );
}
