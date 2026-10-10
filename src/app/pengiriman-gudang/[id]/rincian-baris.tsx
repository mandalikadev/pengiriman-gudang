import { CircleDashed, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatAngka, formatBulanLaporan } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { formatTanggal, type KategoriDasar } from "@/domain/kalender";
import type { BarisDraft, DraftRencana, TokoDraft } from "@/server/gudang/draft-rencana";
import { labelPersiapan, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";
import type { SumberKategoriDraft } from "@/server/gudang/rincian-draft";
import { nilaiRincian } from "@/server/laporan/rincian";

import { DaftarMasalah } from "./daftar-masalah";
import { formatJumlahKirim, formatKebutuhan } from "./format-rincian";

// Rincian perhitungan satu baris draft (T60; PRD A1, A6; DESIGN §8). Zona kerja. Semua angka dibaca dari draft
// tersimpan; komponen hanya menampilkan dan tidak menghitung rumus.

/** Id bagian rincian yang sedang dibuka (hanya satu per halaman); tujuan tautan `#…`. */
export const ID_RINCIAN_BARIS = "rincian-baris";

const KATEGORI: readonly KategoriDasar[] = ["Senin–Kamis", "Jumat", "Sabtu", "Minggu"];

const labelSumberKategori = {
  dasar: "Kategori dasar",
  "semua-toko": "Perubahan kategori seluruh toko",
  toko: "Perubahan kategori khusus toko ini",
} as const satisfies Record<SumberKategoriDraft, string>;

const kelasTautan =
  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-primary underline-offset-4 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Penelusuran Ringkasan (T37) untuk satu Rata-rata Ringkasan toko–varian pada bulan periode sumber draft. Ringkasan
 * disaring ke toko dan produk ini sehingga barisnya selalu tampil; `#rincian` = bagian penelusuran di halaman Ringkasan.
 */
function urlPenelusuranRingkasan(bulanSumber: readonly string[], tokoId: number, kodeProduk: string, kategori: KategoriDasar) {
  const parameter = new URLSearchParams([
    ...bulanSumber.map((b) => ["bulan", b]),
    ["toko", String(tokoId)],
    ["produk", kodeProduk],
    ["rincian", nilaiRincian(tokoId, kodeProduk, kategori)],
  ]);
  return `/ringkasan?${parameter.toString()}#rincian`;
}

function TidakTersedia() {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span aria-hidden>—</span>
      <BadgeStatus status="tidakTersedia" />
    </span>
  );
}

function Bagian({ judul, children, ...props }: { judul: string; children: ReactNode } & Record<`data-${string}`, string | number>) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted px-4 py-3" {...props}>
      <h6 className="font-semibold">{judul}</h6>
      {children}
    </div>
  );
}

function TanggalCakupan({
  toko,
  rincian,
}: {
  toko: TokoDraft & { cakupan: NonNullable<TokoDraft["cakupan"]> };
  rincian: NonNullable<BarisDraft["rincian"]>;
}) {
  const { cakupan } = toko;
  const awal = cakupan[0];
  const akhir = cakupan[cakupan.length - 1];
  return (
    <Bagian judul="Tanggal cakupan" data-tahap="cakupan">
      <p className="text-muted-foreground">
        {awal && akhir ? `${formatTanggal(awal.tanggal)} – ${formatTanggal(akhir.tanggal)} · ` : null}
        {cakupan.length} hari · Persiapan {labelPersiapan[persiapanDariHari[toko.persiapanHari]]} · Panjang cakupan{" "}
        {toko.panjangCakupan} hari
      </p>
      <ul aria-label="Tanggal cakupan" className="flex flex-col gap-1">
        {cakupan.map((t) => {
          const nilai = rincian.rataRata[t.kategoriEfektif];
          return (
            <li
              key={t.tanggal}
              data-tanggal-cakupan={t.tanggal}
              data-sumber-kategori={t.sumberKategori}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <span className="font-semibold">{formatTanggal(t.tanggal)}</span>
              <span>· {t.kategoriEfektif}</span>
              <span className="text-muted-foreground">· {labelSumberKategori[t.sumberKategori]}</span>
              <span>·</span>
              {nilai === undefined ? <TidakTersedia /> : <span className="tabular-nums">Rata-rata {formatAngka(nilai)}</span>}
            </li>
          );
        })}
      </ul>
    </Bagian>
  );
}

function RataRataPerKategori({ baris, tokoId, bulanSumber }: { baris: BarisDraft; tokoId: number; bulanSumber: readonly string[] }) {
  const rataRata = baris.rincian?.rataRata ?? {};
  return (
    <Bagian judul="Rata-rata per kategori" data-tahap="rata-rata">
      <p className="text-muted-foreground">
        Rata-rata Ringkasan periode sumber: {bulanSumber.map(formatBulanLaporan).join(", ")}. Buka angka untuk menelusuri
        asalnya.
      </p>
      <ul aria-label="Rata-rata per kategori" className="flex flex-col gap-1">
        {KATEGORI.map((kategori) => {
          const nilai = rataRata[kategori];
          return (
            <li key={kategori} data-rata-rata-kategori={kategori} className="flex flex-wrap items-center gap-2">
              <span>Rata-rata {kategori}:</span>
              {nilai === undefined ? (
                <TidakTersedia />
              ) : (
                <Link
                  href={urlPenelusuranRingkasan(bulanSumber, tokoId, baris.kodeProduk, kategori)}
                  data-tautan-ringkasan={kategori}
                  className={`${kelasTautan} tabular-nums underline`}
                >
                  {formatAngka(nilai)}
                  <span className="sr-only">: penelusuran Ringkasan Rata-rata {kategori}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Bagian>
  );
}

function Kebutuhan({ baris }: { baris: BarisDraft }) {
  if (baris.kebutuhan === null) {
    return (
      <Bagian judul="Kebutuhan barang" data-kebutuhan-rincian="tidak-tersedia">
        <TidakTersedia />
        <span className="text-muted-foreground">Tanpa rata-rata:</span>
        <ul aria-label="Tanggal tanpa rata-rata" className="flex flex-col">
          {(baris.tanpaRataRata ?? []).map((t) => (
            <li key={t.tanggal}>
              {formatTanggal(t.tanggal)} · kategori {t.kategoriEfektif}
            </li>
          ))}
        </ul>
      </Bagian>
    );
  }
  const perKategori = baris.rincian?.kebutuhan ?? null;
  return (
    <Bagian judul="Kebutuhan barang" data-kebutuhan-rincian={baris.kebutuhan}>
      {perKategori === null ? (
        <p className="font-semibold tabular-nums">{formatAngka(baris.kebutuhan)}</p>
      ) : (
        <>
          <ul aria-label="Kebutuhan per kategori" className="flex flex-col gap-1 tabular-nums">
            {perKategori.map((r) => (
          <li key={r.kategori}>
                {r.kategori}: {formatAngka(r.jumlahHari)} hari × rata-rata {formatAngka(r.rataRata)} = {formatAngka(r.subtotal)}
              </li>
            ))}
          </ul>
          <p className="font-semibold tabular-nums">Kebutuhan = {formatKebutuhan(perKategori, baris.kebutuhan)}</p>
        </>
      )}
    </Bagian>
  );
}

function Buffer({ baris, ranking }: { baris: BarisDraft; ranking: DraftRencana["ranking"] }) {
  const asalRanking = `ranking pusat ${formatBulanLaporan(ranking.bulanRanking)} versi ${ranking.versi}`;
  return (
    <Bagian judul="Buffer" data-buffer={baris.persenBuffer ?? "kosong"}>
      {baris.persenBuffer !== null ? (
        <p>
          <span className="font-semibold tabular-nums">{baris.persenBuffer}%</span>
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            {baris.asalBuffer === "tujuh-besar"
              ? `keluarga aroma termasuk tujuh besar ${asalRanking}`
              : `produk otomatis di luar tujuh besar ${asalRanking}`}
          </span>
        </p>
      ) : baris.klasifikasi === "manual" ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span aria-hidden>—</span>
          <BadgeStatus status="manual" />
          <span className="text-muted-foreground">Tanpa buffer otomatis.</span>
        </span>
      ) : (
        <p className="flex items-center gap-2">
          <span aria-hidden>—</span>
          <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
          Keluarga aroma belum dipetakan, jadi buffer belum diketahui.
        </p>
      )}
    </Bagian>
  );
}

function JumlahKirim({ baris }: { baris: BarisDraft }) {
  return (
    <Bagian judul="Jumlah kirim" data-jumlah-kirim-rincian={baris.jumlahKirim ?? "kosong"}>
      {baris.rincianJumlahKirim !== null && baris.jumlahKirim !== null ? (
        <>
          <p className="tabular-nums">{formatJumlahKirim(baris.rincianJumlahKirim)}</p>
          <p className="font-semibold tabular-nums">Jumlah kirim: {formatAngka(baris.jumlahKirim)}</p>
        </>
      ) : (
        <>
          <span aria-hidden>—</span>
          {baris.klasifikasi === "manual" ? <BadgeStatus status="manual" /> : <DaftarMasalah masalah={baris.masalah} />}
        </>
      )}
    </Bagian>
  );
}

/**
 * Rincian perhitungan satu baris draft: tanggal cakupan, kategori efektif dan sumbernya, rata-rata per kategori (tautan
 * ke penelusuran Ringkasan, T37), kebutuhan (jumlah hari × rata-rata), stok, buffer dan asalnya, serta jumlah kirim.
 */
export function RincianBaris({
  baris,
  toko,
  draft,
  urlTutup,
}: {
  baris: BarisDraft;
  toko: TokoDraft;
  draft: DraftRencana;
  urlTutup: string;
}) {
  const { cakupan } = toko;
  return (
    <section
      id={ID_RINCIAN_BARIS}
      aria-labelledby={`${ID_RINCIAN_BARIS}-judul`}
      data-rincian-baris={`${toko.id}|${baris.kodeProduk}`}
      className="flex flex-col gap-3 py-2 whitespace-normal"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 id={`${ID_RINCIAN_BARIS}-judul`} className="text-base font-semibold">
          {`Rincian perhitungan ${baris.kodeProduk} · ${toko.nama}`}
        </h5>
        <Link href={urlTutup} className={kelasTautan}>
          Tutup rincian
        </Link>
      </div>
      {cakupan === null || baris.rincian === null || draft.bulanSumber === null ? (
        <p data-rincian-belum-tersimpan className="flex items-start gap-2">
          <CircleDashed aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
          Tanggal cakupan dan rata-rata belum tersimpan untuk draft ini. Hitung ulang draft untuk melihatnya.
        </p>
      ) : (
        <>
          <TanggalCakupan toko={{ ...toko, cakupan }} rincian={baris.rincian} />
          <RataRataPerKategori baris={baris} tokoId={toko.id} bulanSumber={draft.bulanSumber} />
        </>
      )}
      <Kebutuhan baris={baris} />
      <Bagian judul="Stok akhir" data-stok-rincian={baris.stokAkhir ?? "kosong"}>
        {baris.stokAkhir !== null ? (
          <p className="tabular-nums">{formatAngka(baris.stokAkhir)}</p>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span aria-hidden>—</span>
            <BadgeStatus status="belumDiketahui" />
          </span>
        )}
      </Bagian>
      <Buffer baris={baris} ranking={draft.ranking} />
      <JumlahKirim baris={baris} />
    </section>
  );
}
