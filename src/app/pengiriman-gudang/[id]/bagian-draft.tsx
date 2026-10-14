import { CircleCheck, ClipboardList, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { formatAngka, formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { DialogUrl } from "@/components/dialog-url";
import { KeadaanKosong } from "@/components/keadaan-kosong";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, type TanggalBisnis } from "@/domain/kalender";
import { cn } from "@/lib/utils";
import type { AlasanHitungUlang } from "@/server/gudang/dasar-draft";
import type {
  BarisDraft,
  DraftRencana,
  RingkasanDraftRencana,
  RingkasanTokoDraft,
  StokTidakDipakai,
  TokoDraft,
} from "@/server/gudang/draft-rencana";
import { labelPersiapan, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";
import { MASALAH_TANPA_VARIAN } from "@/server/gudang/masalah-draft";

import { DaftarMasalah } from "./daftar-masalah";
import { BarisFilterKosong, BarisVarian, FilterVarian, KontrolFilterVarian, TautanTampilkanTertahan } from "./filter-varian";
import { FormFinalisasi } from "./form-finalisasi";
import { AjakanHitung, FormHitungDraft } from "./form-hitung-draft";
import { FormHitungUlang } from "./form-hitung-ulang";
import { FormStokToko, InputStok } from "./form-stok-toko";
import { PenandaDiLuarJadwal } from "./penanda-di-luar-jadwal";
import { RincianBaris } from "./rincian-baris";
import { IkonStokKosong } from "./stok-kosong";

/** Stok akhir tersimpan di baris ringkas draft (pengguna tanpa hak `input-stok`): kosong tampil "—" + ikon (DESIGN §11.4). */
function SelStokRingkas({ stokAkhir }: { stokAkhir: number | null }) {
  if (stokAkhir !== null) return <>{formatAngka(stokAkhir)}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <IkonStokKosong />
      <span aria-hidden>—</span>
    </span>
  );
}

/** Kebutuhan barang di tabel varian; juga dipakai rincian rencana final (T63). */
export function SelKebutuhan({ baris }: { baris: Pick<BarisDraft, "kebutuhan" | "tanpaRataRata"> }) {
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
export function SelStok({ stokAkhir }: { stokAkhir: number | null }) {
  if (stokAkhir !== null) return <>{formatAngka(stokAkhir)}</>;
  return (
    <div className="flex flex-col items-end gap-1">
      <span aria-hidden>—</span>
      <BadgeStatus status="belumDiketahui" />
    </div>
  );
}

/** Masalah toko tanpa varian (PRD A7 ▶ Keputusan 2026-10-11, T62): ikon + teks seperti masalah baris (DESIGN §7). */
function MasalahTanpaVarian() {
  return (
    <p data-tanpa-varian className="flex items-center gap-2 font-semibold">
      <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
      {MASALAH_TANPA_VARIAN}
    </p>
  );
}

/**
 * Peringatan "kiriman sebelumnya belum sampai" (PRD A6 ▶ Keputusan 2026-10-12, T93): hari persiapan jatuh pada atau
 * sebelum tanggal kirim toko sebelumnya saat draft dihitung (T114). Ikon + teks `warning` (DESIGN §7); tidak menahan
 * finalisasi.
 */
const teksKirimanSebelumnya = (tanggal: TanggalBisnis) =>
  `Kiriman ${formatTanggal(tanggal)} belum sampai saat persiapan. Pastikan jumlahnya ikut dihitung di stok akhir.`;

function PeringatanKirimanSebelumnya({ tanggal }: { tanggal: TanggalBisnis | null }) {
  if (tanggal === null) return null;
  return (
    <p data-kiriman-sebelumnya-belum-sampai={tanggal} className="flex items-start gap-2 font-semibold">
      <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
      {teksKirimanSebelumnya(tanggal)}
    </p>
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
type RincianDraft = {
  idGudang: number;
  draft: Pick<DraftRencana, "tanggalKirim" | "bulanSumber" | "ranking">;
  terbuka: string | null;
};

/** Id judul bagian satu toko yang dibuka; tujuan tautan `#…` saat toko dibuka (T73). */
const idBagianToko = (tokoId: number) => `draft-toko-${tokoId}`;

/**
 * Halaman draft ini: tanpa `toko` = ringkasan per toko saja; dengan `toko` = toko itu dibuka (T73), dan dengan
 * `rincian` = rincian satu baris toko itu terbuka di panel samping (T60, T108).
 */
function urlDraft(
  idGudang: number,
  tanggalKirim: TanggalBisnis,
  buka: { toko?: number; rincian?: string; tanpaJangkar?: boolean } = {},
) {
  const parameter = new URLSearchParams({ tanggal: tanggalKirim });
  if (buka.toko === undefined) return `/pengiriman-gudang/${idGudang}?${parameter.toString()}`;
  parameter.set("toko", String(buka.toko));
  if (buka.rincian === undefined) {
    const url = `/pengiriman-gudang/${idGudang}?${parameter.toString()}`;
    return buka.tanpaJangkar ? url : `${url}#${idBagianToko(buka.toko)}`;
  }
  parameter.set("rincian", buka.rincian);
  return `/pengiriman-gudang/${idGudang}?${parameter.toString()}`;
}

const kelasDasarTautan =
  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold underline underline-offset-4 transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const kelasTautan = `${kelasDasarTautan} text-primary hover:bg-primary/10`;
/** Tautan di baris ringkas tabel varian (DESIGN §11.4): setinggi isian tabel (h-9) agar baris ±44 px; area sel ikut. */
const kelasTautanBarisRingkas = kelasTautan.replace("min-h-11", "min-h-9");
/** Tautan di baris terpilih (latar accent): primary di atas accent di bawah 4,5 : 1, jadi accent-foreground (DESIGN §2). */
const kelasTautanBarisTerpilih = `${kelasDasarTautan} text-accent-foreground hover:bg-accent-foreground/10`;

/** Id tabel varian satu toko; tujuan "Tampilkan baris tertahan" (T117). */
const idTabelVarian = (tokoId: number) => `tabel-varian-${tokoId}`;
const JUMLAH_KOLOM_VARIAN = 8;

/**
 * Tabel varian satu toko yang dibuka, dengan baris ringkas (±44 px, isi sel sejajar tengah) dan filter tampilan beserta
 * pencarian (T117; DESIGN §11.4). Filter hanya menyembunyikan baris; isian stok di baris tersembunyi tetap ikut disimpan.
 */
function TabelVarian({ toko, inputStok, rincian }: { toko: TokoDraft; inputStok: InputStokDraft; rincian: RincianDraft }) {
  const { idGudang, draft } = rincian;
  return (
    <>
      <KontrolFilterVarian namaToko={toko.nama} />
      <Table id={idTabelVarian(toko.id)} aria-label={`Varian ${toko.nama}`} panjang kolomMenempel={2} className="[&_td]:py-1">
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
            return (
              <BarisVarian key={b.kodeProduk} kodeProduk={b.kodeProduk}>
                <TableCell className="font-semibold">{b.kodeProduk}</TableCell>
                <TableCell>{b.namaProduk ?? "—"}</TableCell>
                <TableCell>{b.klasifikasi === "manual" ? <BadgeStatus status="manual" /> : "Otomatis"}</TableCell>
                <TableCell angka data-kebutuhan={b.kebutuhan ?? "tidak-tersedia"}>
                  <SelKebutuhan baris={b} />
                </TableCell>
                <TableCell angka data-stok-akhir={b.stokAkhir ?? "kosong"}>
                  {inputStok === null ? <SelStokRingkas stokAkhir={b.stokAkhir} /> : <InputStok kodeProduk={b.kodeProduk} />}
                </TableCell>
                <TableCell angka data-jumlah-kirim={b.jumlahKirim ?? "kosong"}>
                  {b.jumlahKirim === null ? "—" : formatAngka(b.jumlahKirim)}
                </TableCell>
                <TableCell>
                  <DaftarMasalah masalah={b.masalah} />
                </TableCell>
                <TableCell>
                  {/* Navigasi klien tanpa menggulir: panel terbuka di atas halaman, isian stok tetap (DESIGN §11.2). */}
                  <Link
                    href={urlDraft(idGudang, draft.tanggalKirim, { toko: toko.id, rincian: nilaiRincian })}
                    scroll={false}
                    aria-current={rincian.terbuka === nilaiRincian ? "true" : undefined}
                    data-tautan-rincian-baris={nilaiRincian}
                    data-buka-panel
                    className={kelasTautanBarisRingkas}
                  >
                    Lihat rincian
                    <span className="sr-only"> perhitungan {b.kodeProduk}</span>
                  </Link>
                </TableCell>
              </BarisVarian>
            );
          })}
          <BarisFilterKosong jumlahKolom={JUMLAH_KOLOM_VARIAN} />
        </TableBody>
      </Table>
    </>
  );
}

/**
 * Rincian perhitungan baris yang diminta URL, di panel samping (T60; DESIGN §11.2, T108). Diletakkan di luar tabel agar
 * panel tidak terkurung stacking context sel yang menempel.
 */
function PanelRincianBaris({ toko, rincian }: { toko: TokoDraft; rincian: RincianDraft }) {
  const { idGudang, draft, terbuka } = rincian;
  const baris = toko.baris.find((b) => `${toko.id}|${b.kodeProduk}` === terbuka);
  if (baris === undefined || terbuka === null) return null;
  return (
    <DialogUrl
      key={terbuka}
      bentuk="samping"
      judul={`Rincian perhitungan ${baris.kodeProduk} · ${toko.nama}`}
      urlTutup={urlDraft(idGudang, draft.tanggalKirim, { toko: toko.id, tanpaJangkar: true })}
      pembukaCadangan={`[data-tautan-rincian-baris="${terbuka}"]`}
    >
      <RincianBaris baris={baris} toko={toko} draft={draft} />
    </DialogUrl>
  );
}

/** Finalisasi per toko (T62): `null` = pengguna tanpa hak `finalisasi`. */
type FinalisasiDraft = { idGudang: number; tanggalKirim: TanggalBisnis } | null;

/**
 * Finalisasi satu toko (T62) untuk operator dengan hak `finalisasi`: form finalisasi bila toko siap, atau alasan belum
 * bisa difinalisasi (dasar perhitungan toko itu berubah, toko tanpa varian, atau ada baris tertahan). Toko yang sudah
 * final mendapat form finalisasi ulang dengan alasan wajib (PRD A7 ▶ Keputusan 2026-10-11, T62); daftar versi dan
 * rincian rencana final adalah bagian riwayat (T63).
 */
export function FinalisasiToko({
  toko,
  finalisasi,
}: {
  toko: Pick<
    TokoDraft,
    "id" | "nama" | "versi" | "versiFinal" | "perluDihitungUlang" | "jumlahTertahan" | "kirimanSebelumnyaBelumSampai"
  > & { baris: Pick<BarisDraft, "kodeProduk" | "stokAkhir" | "jumlahKirim">[] };
  finalisasi: FinalisasiDraft;
}) {
  if (finalisasi === null) return null;
  const alasan =
    toko.perluDihitungUlang.length > 0
      ? `dasar perhitungan toko ini berubah (${toko.perluDihitungUlang.map((a) => labelAlasan[a]).join(", ")}). Hitung ulang draft lebih dulu.`
      : toko.baris.length === 0
        ? `${MASALAH_TANPA_VARIAN.toLowerCase()}.`
        : toko.jumlahTertahan > 0
          ? `${formatAngka(toko.jumlahTertahan)} baris masih tertahan.`
          : null;
  if (alasan !== null) {
    const hanyaTertahan = toko.perluDihitungUlang.length === 0 && toko.baris.length > 0;
    return (
      <div className="flex flex-wrap items-center gap-x-2">
        <p data-finalisasi-tertahan={toko.id} className="flex items-start gap-2 font-semibold">
          <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
          Belum bisa difinalisasi: {alasan}
        </p>
        {/* T117: memasang filter Tertahan di tabel varian toko ini. */}
        {hanyaTertahan ? <TautanTampilkanTertahan idTabel={idTabelVarian(toko.id)} /> : null}
      </div>
    );
  }
  return (
    <FormFinalisasi
      idGudang={finalisasi.idGudang}
      tanggalKirim={finalisasi.tanggalKirim}
      tokoId={toko.id}
      namaToko={toko.nama}
      versi={toko.versi}
      versiFinal={toko.versiFinal}
      stokTersimpan={toko.baris.map((b) => ({ kodeProduk: b.kodeProduk, stokAkhir: b.stokAkhir }))}
      ringkasan={{
        jumlahVarian: toko.baris.length,
        // Produk manual tidak punya jumlah kirim (PRD A6), jadi tidak menambah total.
        totalJumlahKirim: toko.baris.reduce((total, b) => total + (b.jumlahKirim ?? 0), 0),
        peringatan:
          toko.kirimanSebelumnyaBelumSampai === null ? [] : [teksKirimanSebelumnya(toko.kirimanSebelumnyaBelumSampai)],
      }}
    />
  );
}

function TabelToko({
  toko,
  inputStok,
  rincian,
  finalisasi,
}: {
  toko: TokoDraft;
  inputStok: InputStokDraft;
  rincian: RincianDraft;
  finalisasi: FinalisasiDraft;
}) {
  return (
    <section aria-labelledby={idBagianToko(toko.id)} data-draft-toko={toko.id} className="flex flex-col gap-3">
      <FilterVarian
        baris={toko.baris.map((b) => ({
          kodeProduk: b.kodeProduk,
          namaProduk: b.namaProduk,
          tertahan: b.masalah.length > 0,
          stokKosong: b.stokAkhir === null,
          kirimPositif: (b.jumlahKirim ?? 0) > 0,
        }))}
      >
        {/* Kepala toko menempel (T117; DESIGN §11.4): nama, status, baris tertahan, dan finalisasi tetap terlihat. */}
        <div
          data-kepala-toko={toko.id}
          className="sticky top-15 z-35 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 bg-card/95 py-3 backdrop-blur-md lg:top-0"
        >
          <h4 id={idBagianToko(toko.id)} className="scroll-mt-24 text-lg font-semibold">
            {toko.nama}
          </h4>
          <StatusToko toko={toko} terpilih={false} />
          {toko.baris.length === 0 ? null : <RingkasanTertahan jumlah={toko.jumlahTertahan} />}
          <div className="lg:ml-auto">
            <FinalisasiToko toko={toko} finalisasi={finalisasi} />
          </div>
        </div>
        <p className="text-muted-foreground">
          Persiapan {labelPersiapan[persiapanDariHari[toko.persiapanHari]]} · Panjang cakupan {toko.panjangCakupan} hari
        </p>
        <PenandaDiLuarJadwal keterangan={toko.diLuarJadwal} />
        <PeringatanKirimanSebelumnya tanggal={toko.kirimanSebelumnyaBelumSampai} />
        {toko.baris.length === 0 ? (
          <MasalahTanpaVarian />
        ) : inputStok === null ? (
          <TabelVarian toko={toko} inputStok={null} rincian={rincian} />
        ) : (
          <FormStokToko
            idGudang={inputStok.idGudang}
            tanggalKirim={inputStok.tanggalKirim}
            tokoId={toko.id}
            namaToko={toko.nama}
            stokTersimpan={toko.baris.map((b) => ({ kodeProduk: b.kodeProduk, stokAkhir: b.stokAkhir, klasifikasi: b.klasifikasi }))}
          >
            <TabelVarian toko={toko} inputStok={inputStok} rincian={rincian} />
          </FormStokToko>
        )}
        <PanelRincianBaris toko={toko} rincian={rincian} />
      </FilterVarian>
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
        Dasar perhitungan berubah sejak draft ini dihitung. Toko yang terkena perubahan ini tidak bisa difinalisasi sebelum
        draft dihitung ulang.
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

/** Status toko di ringkasan: Final beserta versinya (T62), atau Draft; ditambah Perlu dihitung ulang bila terdampak (T61). */
function StatusToko({ toko, terpilih }: { toko: Pick<RingkasanTokoDraft, "versiFinal" | "perluDihitungUlang">; terpilih: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {toko.versiFinal !== null ? (
        <>
          <BadgeStatus status="final" />
          {/* Teks sekunder di baris terpilih (latar accent) memakai accent-foreground (DESIGN §2). */}
          <span data-versi-final={toko.versiFinal} className={terpilih ? "text-accent-foreground" : "text-muted-foreground"}>
            Versi {toko.versiFinal}
          </span>
        </>
      ) : (
        <BadgeStatus status="draft" />
      )}
      {toko.perluDihitungUlang.length > 0 ? <BadgeStatus status="perluDihitungUlang" /> : null}
    </div>
  );
}

/**
 * Ringkasan per toko (PRD C1 ▶ Keputusan 2026-10-11, T65; T73): nama, jumlah varian, baris tertahan, dan status setiap
 * toko di draft. Toko dibuka lewat tautan (parameter URL `toko`) supaya halaman hanya merender baris toko itu.
 */
function TabelRingkasanToko({
  idGudang,
  draft,
}: {
  idGudang: number;
  draft: Pick<RingkasanDraftRencana, "tanggalKirim" | "toko" | "tokoDibuka">;
}) {
  return (
    <Table aria-label="Ringkasan per toko">
      <TableHeader>
        <TableRow>
          <TableHead>Toko</TableHead>
          <TableHead angka>Varian</TableHead>
          <TableHead>Baris tertahan</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Buka toko</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {draft.toko.map((t) => {
          const dibuka = draft.tokoDibuka?.id === t.id;
          return (
            <TableRow
              key={t.id}
              data-ringkasan-toko={t.id}
              aria-current={dibuka ? "true" : undefined}
              className={cn(dibuka && "bg-accent text-accent-foreground hover:bg-accent")}
            >
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{t.nama}</span>
                  <PenandaDiLuarJadwal keterangan={t.diLuarJadwal} terpilih={dibuka} />
                </div>
              </TableCell>
              <TableCell angka data-jumlah-baris={t.jumlahBaris}>
                {formatAngka(t.jumlahBaris)}
              </TableCell>
              <TableCell>{t.jumlahBaris === 0 ? <MasalahTanpaVarian /> : <RingkasanTertahan jumlah={t.jumlahTertahan} />}</TableCell>
              <TableCell>
                <StatusToko toko={t} terpilih={dibuka} />
              </TableCell>
              <TableCell>
                <Link
                  href={dibuka ? urlDraft(idGudang, draft.tanggalKirim) : urlDraft(idGudang, draft.tanggalKirim, { toko: t.id })}
                  data-tautan-buka-toko={t.id}
                  className={dibuka ? kelasTautanBarisTerpilih : kelasTautan}
                >
                  {dibuka ? "Tutup" : "Buka"}
                  <span className="sr-only"> {t.nama}</span>
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function IsiDraft({
  idGudang,
  draft,
  inputStok,
  rincianTerbuka,
  hitungUlang,
  finalisasi,
}: {
  idGudang: number;
  draft: RingkasanDraftRencana;
  inputStok: InputStokDraft;
  rincianTerbuka: string | null;
  hitungUlang: HitungUlangDraft;
  finalisasi: FinalisasiDraft;
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
        <>
          <TabelRingkasanToko idGudang={idGudang} draft={draft} />
          {draft.tokoDibuka === null ? null : (
            <TabelToko
              toko={draft.tokoDibuka}
              inputStok={inputStok}
              rincian={{ idGudang, draft, terbuka: rincianTerbuka }}
              finalisasi={finalisasi}
            />
          )}
        </>
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
 * Chip draft tersimpan dari yang terdekat (T118, DESIGN §11.5): tanggal kirim hari ini atau sesudahnya urut naik, lalu
 * tanggal yang sudah lewat dari yang paling baru.
 */
function urutDariTerdekat(daftarTanggal: readonly TanggalBisnis[], hariIni: TanggalBisnis): TanggalBisnis[] {
  const akanDatang = daftarTanggal.filter((t) => t >= hariIni).sort();
  const lewat = daftarTanggal.filter((t) => t < hariIni).sort().reverse();
  return [...akanDatang, ...lewat];
}

/** Penanda chip tanggal kirim terdekat (T118). Latar `card` + teks `foreground` terbaca di chip biasa maupun terpilih. */
function PenandaTerdekat() {
  return (
    <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-semibold text-foreground">Terdekat</span>
  );
}

/**
 * Bagian Draft rencana halaman Pengiriman Gudang (T58, PRD A6 ▶ Keputusan perencanaan M2–M3). Menampilkan draft yang
 * tersimpan, tanpa menghitung saat halaman dibuka (PRD C1). Form hitung tampil hanya untuk operator dengan hak
 * `hitung-kebutuhan` (diperiksa lagi di server); pengguna lain, termasuk admin, hanya melihat. Isian stok akhir per toko
 * (T59) tampil hanya untuk operator dengan hak `input-stok` (diperiksa lagi di server). Draft yang dasar perhitungannya
 * berubah diberi penanda "Perlu dihitung ulang" (T61). Finalisasi per toko (T62) hanya untuk operator dengan hak
 * `finalisasi` (diperiksa lagi di server); toko yang sudah final ditandai Final beserta versinya untuk semua yang bisa
 * melihat halaman. Draft tampil sebagai ringkasan per toko; baris, isian stok, finalisasi, dan rincian baris hanya
 * dirender untuk toko yang dibuka (T73; PRD C1 ▶ Keputusan 2026-10-11, T65). T118 (DESIGN §11.5): chip draft tersimpan
 * urut dari yang terdekat dengan penanda "Terdekat", form hitung menampilkan saran tanggal kirim, dan tanggal kirim
 * terdekat yang belum punya draft mendapat ajakan "Hitung kebutuhan untuk …".
 */
export function BagianDraft({
  idGudang,
  bolehHitung,
  bolehInputStok,
  bolehFinalisasi,
  daftarTanggal,
  tanggalDiminta,
  tanggalTerdekat,
  hariIni,
  saranTanggal,
  draft,
  rincianDiminta,
  tokoNonaktifBerjadwal,
}: {
  idGudang: number;
  bolehHitung: boolean;
  bolehInputStok: boolean;
  bolehFinalisasi: boolean;
  /** Tanggal kirim draft yang tersimpan. */
  daftarTanggal: TanggalBisnis[];
  /** Tanggal kirim yang dibuka: dari URL, atau tanggal kirim terdekat; `null` = draft terakhir dihitung. */
  tanggalDiminta: TanggalBisnis | null;
  /** Tanggal kirim terdekat gudang (hari ini atau sesudahnya); `null` = tidak ada toko aktif berjadwal. */
  tanggalTerdekat: TanggalBisnis | null;
  hariIni: TanggalBisnis;
  /** Saran tanggal kirim form "Hitung kebutuhan": tanggal kirim toko 14 hari ke depan. */
  saranTanggal: TanggalBisnis[];
  /** Draft sebagai ringkasan per toko, dengan baris hanya untuk toko yang dibuka (T73). */
  draft: RingkasanDraftRencana | null;
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
        {bolehHitung ? <FormHitungDraft idGudang={idGudang} saranTanggal={saranTanggal} /> : null}
        {daftarTanggal.length > 0 ? (
          <nav aria-label="Draft tersimpan" className="flex flex-col gap-2">
            <span className="font-semibold">Draft tersimpan</span>
            <ul className="flex flex-wrap gap-2">
              {urutDariTerdekat(daftarTanggal, hariIni).map((tanggal) => {
                const terpilih = draft?.tanggalKirim === tanggal;
                const terdekat = tanggal === tanggalTerdekat;
                return (
                  <li key={tanggal}>
                    <Link
                      href={`/pengiriman-gudang/${idGudang}?tanggal=${tanggal}`}
                      aria-current={terpilih ? "page" : undefined}
                      data-terdekat={terdekat ? "" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        terpilih ? "bg-accent text-accent-foreground" : "text-primary hover:bg-primary/10",
                      )}
                    >
                      {formatTanggal(tanggal)}
                      {terdekat ? <PenandaTerdekat /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
        {draft !== null ? (
          <IsiDraft
            idGudang={idGudang}
            draft={draft}
            inputStok={bolehInputStok ? { idGudang, tanggalKirim: draft.tanggalKirim } : null}
            rincianTerbuka={rincianDiminta}
            hitungUlang={bolehHitung ? { idGudang, tanggalKirim: draft.tanggalKirim } : null}
            finalisasi={bolehFinalisasi ? { idGudang, tanggalKirim: draft.tanggalKirim } : null}
          />
        ) : (
          <KeadaanKosong
            ikon={ClipboardList}
            judul={
              tanggalDiminta === null
                ? "Belum ada draft rencana di gudang ini."
                : `Belum ada draft rencana untuk ${formatTanggal(tanggalDiminta)}.`
            }
            langkah={
              bolehHitung
                ? "Pilih tanggal kirim, lalu tekan Hitung kebutuhan."
                : "Draft dibuat oleh operator gudang ini yang berhak menghitung kebutuhan."
            }
          >
            {bolehHitung && tanggalDiminta !== null && tanggalDiminta === tanggalTerdekat ? (
              <AjakanHitung idGudang={idGudang} tanggalKirim={tanggalDiminta} />
            ) : null}
          </KeadaanKosong>
        )}
      </CardContent>
    </Card>
  );
}
