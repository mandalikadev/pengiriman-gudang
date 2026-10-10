import { CircleCheck, ClipboardList, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { formatAngka, formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, type TanggalBisnis } from "@/domain/kalender";
import { cn } from "@/lib/utils";
import type { AlasanHitungUlang } from "@/server/gudang/dasar-draft";
import type { BarisDraft, DraftRencana, StokTidakDipakai, TokoDraft } from "@/server/gudang/draft-rencana";
import { labelPersiapan, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";

import { DaftarMasalah } from "./daftar-masalah";
import { FormHitungDraft } from "./form-hitung-draft";
import { FormHitungUlang } from "./form-hitung-ulang";
import { FormStokToko, InputStok } from "./form-stok-toko";
import { ID_RINCIAN_BARIS, RincianBaris } from "./rincian-baris";

function SelKebutuhan({ baris }: { baris: BarisDraft }) {
  if (baris.kebutuhan !== null) return <>{formatAngka(baris.kebutuhan)}</>;
  return (
    <div className="flex flex-col items-end gap-1">
      <span aria-hidden>—</span>
      <BadgeStatus status="tidakTersedia" />
      <span className="text-muted-foreground">Tanpa rata-rata:</span>
      <ul aria-label="Tanggal tanpa rata-rata" className="flex flex-col items-end">
        {(baris.tanpaRataRata ?? []).map((t) => (
          <li key={t.tanggal} data-tanpa-rata-rata={t.tanggal}>
            {formatTanggal(t.tanggal)} · kategori {t.kategoriEfektif}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stok akhir tersimpan untuk pengguna tanpa hak `input-stok`: kosong tampil "—" belum diketahui (DESIGN §7). */
function SelStok({ stokAkhir }: { stokAkhir: number | null }) {
  if (stokAkhir !== null) return <>{formatAngka(stokAkhir)}</>;
  return (
    <div className="flex flex-col items-end gap-1">
      <span aria-hidden>—</span>
      <BadgeStatus status="belumDiketahui" />
    </div>
  );
}

/** Ringkasan masalah per toko: jumlah baris tertahan (ikon + teks, DESIGN §7). */
function RingkasanTertahan({ jumlah }: { jumlah: number }) {
  const Ikon = jumlah > 0 ? TriangleAlert : CircleCheck;
  return (
    <p data-jumlah-tertahan={jumlah} className="flex items-center gap-2 font-semibold">
      <Ikon aria-hidden strokeWidth={2} className={cn("size-5 shrink-0", jumlah > 0 ? "text-warning" : "text-success")} />
      {jumlah > 0 ? `${formatAngka(jumlah)} baris tertahan` : "Tidak ada baris tertahan"}
    </p>
  );
}

type InputStokDraft = { idGudang: number; tanggalKirim: TanggalBisnis } | null;

/** Rincian perhitungan per baris (T60): `terbuka` = nilai URL `<id toko>|<kode produk>` baris yang rinciannya dibuka. */
type RincianDraft = { idGudang: number; draft: DraftRencana; terbuka: string | null };

/** Halaman draft ini, dengan rincian satu baris terbuka bila `rincian` diberikan. */
function urlDraft(idGudang: number, tanggalKirim: TanggalBisnis, rincian?: string) {
  const parameter = new URLSearchParams({ tanggal: tanggalKirim });
  if (rincian === undefined) return `/pengiriman-gudang/${idGudang}?${parameter.toString()}`;
  parameter.set("rincian", rincian);
  return `/pengiriman-gudang/${idGudang}?${parameter.toString()}#${ID_RINCIAN_BARIS}`;
}

const JUMLAH_KOLOM_VARIAN = 8;

function TabelVarian({ toko, inputStok, rincian }: { toko: TokoDraft; inputStok: InputStokDraft; rincian: RincianDraft }) {
  const { idGudang, draft } = rincian;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kode produk</TableHead>
          <TableHead>Nama produk</TableHead>
          <TableHead>Klasifikasi</TableHead>
          <TableHead angka>Kebutuhan barang</TableHead>
          <TableHead angka>Stok akhir</TableHead>
          <TableHead angka>Jumlah kirim</TableHead>
          <TableHead>Masalah</TableHead>
          <TableHead>
            <span className="sr-only">Rincian perhitungan</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {toko.baris.map((b) => {
          const nilaiRincian = `${toko.id}|${b.kodeProduk}`;
          const terbuka = rincian.terbuka === nilaiRincian;
          return (
            <Fragment key={b.kodeProduk}>
              <TableRow data-kode-produk={b.kodeProduk}>
                <TableCell className="font-semibold">{b.kodeProduk}</TableCell>
                <TableCell>{b.namaProduk ?? "—"}</TableCell>
                <TableCell>{b.klasifikasi === "manual" ? <BadgeStatus status="manual" /> : "Otomatis"}</TableCell>
                <TableCell angka className="align-top" data-kebutuhan={b.kebutuhan ?? "tidak-tersedia"}>
                  <SelKebutuhan baris={b} />
                </TableCell>
                <TableCell angka className="align-top" data-stok-akhir={b.stokAkhir ?? "kosong"}>
                  {inputStok === null ? <SelStok stokAkhir={b.stokAkhir} /> : <InputStok kodeProduk={b.kodeProduk} />}
                </TableCell>
                <TableCell angka className="align-top" data-jumlah-kirim={b.jumlahKirim ?? "kosong"}>
                  {b.jumlahKirim === null ? "—" : formatAngka(b.jumlahKirim)}
                </TableCell>
                <TableCell className="align-top">
                  <DaftarMasalah masalah={b.masalah} />
                </TableCell>
                <TableCell className="align-top">
                  <Link
                    href={urlDraft(idGudang, draft.tanggalKirim, nilaiRincian)}
                    aria-current={terbuka ? "true" : undefined}
                    data-tautan-rincian-baris={nilaiRincian}
                    className="inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-primary underline underline-offset-4 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Rincian
                    <span className="sr-only"> perhitungan {b.kodeProduk}</span>
                  </Link>
                </TableCell>
              </TableRow>
              {terbuka ? (
                <TableRow>
                  <TableCell colSpan={JUMLAH_KOLOM_VARIAN}>
                    <RincianBaris baris={b} toko={toko} draft={draft} urlTutup={urlDraft(idGudang, draft.tanggalKirim)} />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function TabelToko({ toko, inputStok, rincian }: { toko: TokoDraft; inputStok: InputStokDraft; rincian: RincianDraft }) {
  return (
    <section aria-labelledby={`draft-toko-${toko.id}`} data-draft-toko={toko.id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h4 id={`draft-toko-${toko.id}`} className="text-lg font-semibold">
          {toko.nama}
        </h4>
        <p className="text-muted-foreground">
          Persiapan {labelPersiapan[persiapanDariHari[toko.persiapanHari]]} · Panjang cakupan {toko.panjangCakupan} hari
        </p>
        <RingkasanTertahan jumlah={toko.jumlahTertahan} />
      </div>
      {toko.baris.length === 0 ? (
        <p data-tanpa-varian className="text-muted-foreground">
          Tidak ada varian di periode sumber untuk toko ini.
        </p>
      ) : inputStok === null ? (
        <TabelVarian toko={toko} inputStok={null} rincian={rincian} />
      ) : (
        <FormStokToko
          idGudang={inputStok.idGudang}
          tanggalKirim={inputStok.tanggalKirim}
          tokoId={toko.id}
          namaToko={toko.nama}
          stokTersimpan={toko.baris.map((b) => ({ kodeProduk: b.kodeProduk, stokAkhir: b.stokAkhir }))}
        >
          <TabelVarian toko={toko} inputStok={inputStok} rincian={rincian} />
        </FormStokToko>
      )}
    </section>
  );
}

/** Label dasar perhitungan yang berubah (istilah CONTEXT.md). */
const labelAlasan: Record<AlasanHitungUlang, string> = {
  "periode-sumber": "Periode sumber",
  "impor-aktif": "Impor aktif",
  "kategori-efektif": "Kategori efektif",
  jadwal: "Jadwal toko",
  ranking: "Ranking pusat",
  pemetaan: "Pemetaan keluarga aroma",
};

type HitungUlangDraft = { idGudang: number; tanggalKirim: TanggalBisnis } | null;

/**
 * Penanda "Perlu dihitung ulang" (DESIGN §7: ikon + teks `warning`) beserta dasar yang berubah (T61). Tombol Hitung
 * ulang hanya untuk operator dengan hak `hitung-kebutuhan` (diperiksa lagi di server).
 */
function PenandaHitungUlang({ alasan, hitungUlang }: { alasan: readonly AlasanHitungUlang[]; hitungUlang: HitungUlangDraft }) {
  return (
    <div data-perlu-dihitung-ulang className="flex flex-col gap-3">
      <BadgeStatus status="perluDihitungUlang" className="w-fit" />
      <p>
        Dasar perhitungan berubah sejak draft ini dihitung. Draft ini tidak bisa difinalisasi sebelum dihitung ulang.
        Stok akhir yang sudah diisi tetap disimpan. Stok untuk toko atau varian yang tidak ada lagi di draft ditampilkan
        sebagai keterangan dan dipakai kembali jika toko atau varian itu muncul lagi.
      </p>
      <div className="flex flex-col gap-1">
        <span className="font-semibold">Yang berubah:</span>
        <ul aria-label="Dasar perhitungan yang berubah" className="flex list-disc flex-col pl-5">
          {alasan.map((a) => (
            <li key={a} data-alasan-hitung-ulang={a}>
              {labelAlasan[a]}
            </li>
          ))}
        </ul>
      </div>
      {hitungUlang === null ? null : <FormHitungUlang idGudang={hitungUlang.idGudang} tanggalKirim={hitungUlang.tanggalKirim} />}
    </div>
  );
}

/** Toko yang dikeluarkan pada hitungan terakhir karena tidak lagi mengirim pada tanggal itu (T61; ikon + teks, DESIGN §7). */
function KeteranganTokoDikeluarkan({ daftarToko }: { daftarToko: readonly { id: number; nama: string }[] }) {
  if (daftarToko.length === 0) return null;
  return (
    <ul aria-label="Toko yang dikeluarkan dari draft" className="flex flex-col gap-2">
      {daftarToko.map((t) => (
        <li key={t.id} data-toko-dikeluarkan={t.id} className="flex items-start gap-2 font-semibold">
          <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
          Toko {t.nama} dikeluarkan dari draft karena tidak lagi mengirim pada tanggal ini menurut jadwal aktif.
        </li>
      ))}
    </ul>
  );
}

const keteranganAlasanStok: Record<StokTidakDipakai["alasan"], string> = {
  "toko-tidak-di-draft": "toko ini tidak ada lagi di draft",
  "varian-tidak-di-draft": "varian ini tidak ada lagi di draft",
};

/**
 * Stok akhir yang sudah diisi tetapi tidak dipakai karena toko atau variannya tidak ada lagi di draft (PRD A7 ▶ Keputusan
 * 2026-10-10, T61; ikon + teks, DESIGN §7). Stoknya tetap disimpan dan dipakai kembali bila toko atau varian itu muncul lagi.
 */
function KeteranganStokTidakDipakai({ daftarStok }: { daftarStok: readonly StokTidakDipakai[] }) {
  if (daftarStok.length === 0) return null;
  return (
    <ul aria-label="Stok yang tidak dipakai" className="flex flex-col gap-2">
      {daftarStok.map((s) => {
        const produk = s.namaProduk === null ? s.kodeProduk : `${s.kodeProduk} (${s.namaProduk})`;
        return (
          <li key={`${s.toko.id}|${s.kodeProduk}`} data-stok-tidak-dipakai={`${s.toko.id}|${s.kodeProduk}`} className="flex items-start gap-2 font-semibold">
            <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
            {`Stok ${produk} di Toko ${s.toko.nama} (${formatAngka(s.stokAkhir)}) tidak dipakai karena ${keteranganAlasanStok[s.alasan]}.`}
          </li>
        );
      })}
    </ul>
  );
}

function IsiDraft({
  draft,
  inputStok,
  rincian,
  hitungUlang,
}: {
  draft: DraftRencana;
  inputStok: InputStokDraft;
  rincian: RincianDraft;
  hitungUlang: HitungUlangDraft;
}) {
  return (
    <div data-draft-tanggal={draft.tanggalKirim} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <BadgeStatus status="draft" />
          <h3 className="text-lg font-semibold">Tanggal kirim {formatTanggal(draft.tanggalKirim)}</h3>
        </div>
        <p className="text-muted-foreground">
          Dihitung oleh <span className="font-semibold text-foreground">{draft.dihitungOleh}</span> pada{" "}
          {formatWaktu(draft.dihitungPada)}.
        </p>
      </div>
      {draft.perluDihitungUlang.length > 0 ? <PenandaHitungUlang alasan={draft.perluDihitungUlang} hitungUlang={hitungUlang} /> : null}
      <KeteranganTokoDikeluarkan daftarToko={draft.tokoDikeluarkan} />
      <KeteranganStokTidakDipakai daftarStok={draft.stokTidakDipakai} />
      {draft.toko.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada toko yang mengirim pada tanggal ini menurut jadwal aktif.</p>
      ) : (
        draft.toko.map((t) => <TabelToko key={t.id} toko={t} inputStok={inputStok} rincian={rincian} />)
      )}
    </div>
  );
}

/**
 * Toko nonaktif yang masih punya jadwal aktif tidak ikut masuk draft; setiap toko diberi peringatan ikon + teks
 * (PRD A6 ▶ Keputusan 2026-10-10, T58; DESIGN §7).
 */
function PeringatanTokoNonaktif({ daftarToko }: { daftarToko: readonly { id: number; nama: string }[] }) {
  if (daftarToko.length === 0) return null;
  return (
    <ul aria-label="Toko nonaktif dengan jadwal aktif" className="flex flex-col gap-2">
      {daftarToko.map((t) => (
        <li key={t.id} data-toko-nonaktif-berjadwal={t.id} className="flex items-start gap-2 font-semibold">
          <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
          Toko {t.nama} nonaktif tetapi masih punya jadwal aktif
        </li>
      ))}
    </ul>
  );
}

/**
 * Bagian Draft rencana halaman Pengiriman Gudang (T58, PRD A6 ▶ Keputusan perencanaan M2–M3). Menampilkan draft yang
 * tersimpan, tanpa menghitung saat halaman dibuka (PRD C1). Form hitung tampil hanya untuk operator dengan hak
 * `hitung-kebutuhan` (diperiksa lagi di server); pengguna lain, termasuk admin, hanya melihat. Isian stok akhir per toko
 * (T59) tampil hanya untuk operator dengan hak `input-stok` (diperiksa lagi di server). Draft yang dasar perhitungannya
 * berubah diberi penanda "Perlu dihitung ulang" (T61).
 */
export function BagianDraft({
  idGudang,
  bolehHitung,
  bolehInputStok,
  daftarTanggal,
  tanggalDiminta,
  draft,
  rincianDiminta,
  tokoNonaktifBerjadwal,
}: {
  idGudang: number;
  bolehHitung: boolean;
  bolehInputStok: boolean;
  /** Tanggal kirim draft yang tersimpan, terbaru di atas. */
  daftarTanggal: TanggalBisnis[];
  tanggalDiminta: TanggalBisnis | null;
  draft: DraftRencana | null;
  /** Nilai URL `<id toko>|<kode produk>` baris draft yang rincian perhitungannya dibuka (T60). */
  rincianDiminta: string | null;
  /** Toko nonaktif gudang ini yang masih punya jadwal aktif. */
  tokoNonaktifBerjadwal: readonly { id: number; nama: string }[];
}) {
  return (
    <Card role="region" aria-labelledby="draft-judul" data-draft-rencana>
      <CardHeader>
        <h2 id="draft-judul" className="flex items-center gap-3 text-xl font-semibold">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardList strokeWidth={2} className="size-5" />
          </span>
          Draft rencana
        </h2>
        <CardDescription>
          Toko yang mengirim pada tanggal kirim menurut jadwal aktifnya, beserta kebutuhan barang setiap varian dari
          rata-rata periode sumber, stok akhir, jumlah kirim, dan masalah yang menahan finalisasi. Buka rincian baris
          untuk melihat asal perhitungannya, termasuk buffer dari ranking pusat.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <PeringatanTokoNonaktif daftarToko={tokoNonaktifBerjadwal} />
        {bolehHitung ? <FormHitungDraft idGudang={idGudang} /> : null}
        {daftarTanggal.length > 0 ? (
          <nav aria-label="Draft tersimpan" className="flex flex-col gap-2">
            <span className="font-semibold">Draft tersimpan</span>
            <ul className="flex flex-wrap gap-2">
              {daftarTanggal.map((tanggal) => {
                const terpilih = draft?.tanggalKirim === tanggal;
                return (
                  <li key={tanggal}>
                    <Link
                      href={`/pengiriman-gudang/${idGudang}?tanggal=${tanggal}`}
                      aria-current={terpilih ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        terpilih ? "bg-accent text-accent-foreground" : "text-primary hover:bg-primary/10",
                      )}
                    >
                      {formatTanggal(tanggal)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
        {draft !== null ? (
          <IsiDraft
            draft={draft}
            inputStok={bolehInputStok ? { idGudang, tanggalKirim: draft.tanggalKirim } : null}
            rincian={{ idGudang, draft, terbuka: rincianDiminta }}
            hitungUlang={bolehHitung ? { idGudang, tanggalKirim: draft.tanggalKirim } : null}
          />
        ) : (
          <p className="text-muted-foreground">
            {tanggalDiminta === null
              ? "Belum ada draft rencana di gudang ini."
              : `Belum ada draft rencana untuk ${formatTanggal(tanggalDiminta)}.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
