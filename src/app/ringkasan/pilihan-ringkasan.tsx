"use client";

import Form from "next/form";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogIsi } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MAKS_BULAN = 12;

/** Cincin fokus chip saat isiannya difokus keyboard (DESIGN §11.8, WCAG 2.4.7); sama dengan tombol dan tautan. */
const kelasFokusChip = "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2";

/** Chip centang (bulan, toko, kategori); juga dipakai pemilih bulan periode sumber di admin Gudang. */
export const kelasChip = `inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-4 font-semibold transition-colors duration-300 ease-out hover:bg-primary/10 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground ${kelasFokusChip}`;

/** Baris centang produk (hasil cari dan produk terpilih). */
const kelasChipProduk = `flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 transition-colors duration-300 ease-out hover:bg-primary/10 has-[:checked]:bg-accent has-[:checked]:text-accent-foreground ${kelasFokusChip}`;

type OpsiProduk = { kode: string; nama: string | null };

/** Pilihan yang sedang dipakai (dari URL). */
type Terapan = { bulan: readonly string[]; toko: readonly string[]; kategoriProduk: readonly string[]; produk: readonly string[] };

/** Pilihan yang sedang diedit beserta pengubahnya; dipakai bersama oleh kartu (layar lebar) dan panel (layar < 640 px). */
type Pilihan = { terpilih: ReadonlySet<string>; setTerpilih: (baru: Set<string>) => void };

function usePilihan(awal: Iterable<string>): Pilihan {
  const [terpilih, setTerpilih] = useState<ReadonlySet<string>>(() => new Set(awal));
  return { terpilih, setTerpilih };
}

function ubahSatu({ terpilih, setTerpilih }: Pilihan, nilai: string, centang: boolean) {
  const baru = new Set(terpilih);
  if (centang) baru.add(nilai);
  else baru.delete(nilai);
  setTerpilih(baru);
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
 * Satu grup chip centang (toko atau kategori produk) dengan tombol "Pilih semua" dan "Kosongkan" (T87, PRD A2).
 * Tombol hanya mengubah pilihan yang sedang diedit; hasil baru berubah setelah Terapkan. `namaGrup` dipakai pada
 * label tombol untuk pembaca layar ("Pilih semua toko").
 */
function GrupCentang({
  judul,
  namaGrup,
  name,
  opsi,
  pilihan,
}: {
  judul: string;
  namaGrup: string;
  name: string;
  opsi: { value: string; label: string }[];
  pilihan: Pilihan;
}) {
  return (
    <Bagian judul={judul}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Pilih semua ${namaGrup}`}
          onClick={() => pilihan.setTerpilih(new Set(opsi.map((o) => o.value)))}
        >
          Pilih semua
        </Button>
        <Button type="button" size="sm" variant="outline" aria-label={`Kosongkan pilihan ${namaGrup}`} onClick={() => pilihan.setTerpilih(new Set())}>
          Kosongkan
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {opsi.map((o) => (
          <label key={o.value} className={kelasChip}>
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={pilihan.terpilih.has(o.value)}
              onChange={(e) => ubahSatu(pilihan, o.value, e.target.checked)}
              className="size-4 accent-primary outline-none"
            />
            {o.label}
          </label>
        ))}
      </div>
    </Bagian>
  );
}

/**
 * Filter produk: cari kode/nama dengan kecocokan teks biasa (bukan fuzzy, PRD C3), banyak pilihan. Produk
 * terpilih selalu tampil; hasil pencarian tampil saat ada teks dicari. Kotak cari tidak ikut ke URL.
 */
function FilterProduk({
  opsi,
  pilihan,
  cari,
  setCari,
}: {
  opsi: OpsiProduk[];
  pilihan: Pilihan;
  cari: string;
  setCari: (cari: string) => void;
}) {
  const { terpilih } = pilihan;
  const teks = cari.trim().toLocaleLowerCase("id");
  const hasil =
    teks === ""
      ? []
      : opsi.filter(
          (p) => !terpilih.has(p.kode) && (p.kode.toLocaleLowerCase("id").includes(teks) || (p.nama ?? "").toLocaleLowerCase("id").includes(teks)),
        );
  const daftarTerpilih = opsi.filter((p) => terpilih.has(p.kode));

  const chip = (p: OpsiProduk) => (
    <label key={p.kode} className={kelasChipProduk}>
      <input
        type="checkbox"
        name="produk"
        value={p.kode}
        checked={terpilih.has(p.kode)}
        onChange={(e) => ubahSatu(pilihan, p.kode, e.target.checked)}
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
          {daftarTerpilih.map(chip)}
        </div>
      ) : null}
      {teks === "" ? null : hasil.length === 0 ? (
        <p aria-live="polite" className="text-muted-foreground">
          Tidak ada produk yang cocok dengan pencarian.
        </p>
      ) : (
        <div role="group" aria-label="Hasil pencarian produk" className="flex max-h-64 flex-col overflow-y-auto rounded-2xl border border-border/60">
          {hasil.map(chip)}
        </div>
      )}
    </Bagian>
  );
}

/**
 * Pemilih bulan laporan (1–12, PRD A2) dan filter toko, kategori produk, dan produk (T35). Mengubah pilihan
 * hanya mengubah pilihan yang sedang diedit; hasil baru berubah setelah Terapkan, yang menulis pilihan ke URL
 * (`?bulan=YYYY-MM&toko=<id>&kategoriProduk=…&produk=<kode>`).
 *
 * DESIGN §11.8 (T122): di layar < 640 px form ini tidak tampil sebagai kartu; tombol "Filter (n)" membukanya di panel
 * samping (layar penuh, §11.2). n = jumlah pilihan filter toko, kategori produk, dan produk yang sedang diterapkan.
 * Kartu dan panel memakai pilihan yang sama, jadi centang di panel tetap ada setelah panel ditutup.
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
  const bulan = usePilihan(terapan.bulan.filter((b) => bulanTersedia.some((t) => t.kode === b)));
  const toko = usePilihan(terapan.toko);
  const kategoriProduk = usePilihan(terapan.kategoriProduk);
  const produk = usePilihan(terapan.produk);
  const [cari, setCari] = useState("");
  const [panelTerbuka, setPanelTerbuka] = useState(false);
  const jumlah = bulan.terpilih.size;
  const sah = jumlah >= 1 && jumlah <= MAKS_BULAN;
  const jumlahFilterTerapan = terapan.toko.length + terapan.kategoriProduk.length + terapan.produk.length;

  /** Isi form; `tempat` membedakan id dan tingkat judul di kartu (di bawah h1) dan di panel (di bawah judul panel h2). */
  const isiForm = (tempat: "kartu" | "panel") => {
    const idJudul = `${id}-${tempat}-judul`;
    return (
      <Form action="/ringkasan" className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle id={idJudul} level={tempat === "kartu" ? 2 : 3}>
            Bulan laporan
          </CardTitle>
          <CardDescription>Pilih 1–12 bulan, boleh tidak berurutan, lalu tekan Terapkan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <fieldset aria-labelledby={idJudul} className="flex flex-wrap gap-2">
            {bulanTersedia.map((b) => (
              <label key={b.kode} className={kelasChip}>
                <input
                  type="checkbox"
                  name="bulan"
                  value={b.kode}
                  checked={bulan.terpilih.has(b.kode)}
                  onChange={(e) => ubahSatu(bulan, b.kode, e.target.checked)}
                  className="size-4 accent-primary outline-none"
                />
                {b.label}
              </label>
            ))}
          </fieldset>
          <GrupCentang
            judul="Toko"
            namaGrup="toko"
            name="toko"
            opsi={opsiFilter.toko.map((t) => ({ value: String(t.id), label: t.nama }))}
            pilihan={toko}
          />
          <GrupCentang
            judul="Kategori produk"
            namaGrup="kategori produk"
            name="kategoriProduk"
            opsi={opsiFilter.kategoriProduk.map((k) => ({ value: k, label: k }))}
            pilihan={kategoriProduk}
          />
          <FilterProduk opsi={opsiFilter.produk} pilihan={produk} cari={cari} setCari={setCari} />
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
    );
  };

  return (
    <>
      <div className="sm:hidden" data-tombol-filter-ponsel>
        <Button type="button" variant="outline" aria-haspopup="dialog" onClick={() => setPanelTerbuka(true)}>
          Filter ({jumlahFilterTerapan})
        </Button>
      </div>
      <Card className="max-sm:hidden" data-kartu-pilihan-ringkasan>
        {isiForm("kartu")}
      </Card>
      <Dialog open={panelTerbuka} onOpenChange={setPanelTerbuka}>
        {panelTerbuka ? (
          <DialogIsi bentuk="samping" judul="Filter Ringkasan">
            {isiForm("panel")}
          </DialogIsi>
        ) : null}
      </Dialog>
    </>
  );
}
