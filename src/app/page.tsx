import {
  CalendarCheck,
  CalendarDays,
  CircleCheck,
  FileSpreadsheet,
  RefreshCcw,
  Store,
  Tags,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { formatAngka, formatBulanImpor, formatBulanLaporan, formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import { StatusCacheLaporan } from "@/components/status-cache-laporan";
import { formatTanggal } from "@/domain/kalender";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { wajibMasuk } from "@/server/auth/kewenangan";
import { muatIsiBeranda, type IsiBeranda, type KartuPerluTindakan, type PeranTampil } from "@/server/beranda/isi-beranda";

// Beranda (T79): zona suasana (DESIGN §1) berisi sapaan, kartu "Perlu tindakan" sesuai peran, status data, dan
// pintasan (DESIGN §9 ▶ Keputusan 2026-10-11). Semua data dibaca dari yang tersimpan (PRD C1) di server setelah sesi
// diperiksa, dan kartu operator dibatasi ke gudang penugasan pengguna (`muatIsiBeranda`).

const labelPeran: Record<PeranTampil, string> = { admin: "Admin", operator: "Operator", viewer: "Viewer" };

/** Label dan ikon fitur setiap jenis kartu; urutan kartu ditentukan `muatIsiBeranda` (urutan issue T79). */
const tampilanKartu: Record<KartuPerluTindakan["jenis"], { label: string; tujuan: string; ikon: LucideIcon }> = {
  "usulan-jadwal": { label: "Usulan jadwal menunggu persetujuan", tujuan: "Persetujuan jadwal", ikon: CalendarCheck },
  "snapshot-libur": { label: "Snapshot libur menunggu ditinjau", tujuan: "Libur", ikon: CalendarDays },
  "produk-belum-dipetakan": { label: "Produk belum dipetakan", tujuan: "Pemetaan produk", ikon: Tags },
  "ranking-bulan-berjalan": { label: "Ranking bulan berjalan belum dipublikasikan", tujuan: "Ranking", ikon: Trophy },
  "impor-gagal-atau-menunggu": { label: "Impor gagal atau menunggu diaktifkan", tujuan: "Impor", ikon: FileSpreadsheet },
  "draft-perlu-dihitung-ulang": { label: "Draft perlu dihitung ulang", tujuan: "Pengiriman Gudang", ikon: RefreshCcw },
  "toko-baris-tertahan": { label: "Toko dengan baris tertahan", tujuan: "Pengiriman Gudang", ikon: TriangleAlert },
  "toko-belum-final": { label: "Toko belum difinalisasi untuk tanggal kirim terdekat", tujuan: "Pengiriman Gudang", ikon: Store },
};

/** Pintasan 2–4 tombol ke halaman utama peran itu (DESIGN §9 ▶ Keputusan). */
const pintasanPeran: Record<PeranTampil, { href: string; label: string }[]> = {
  admin: [
    { href: "/admin/impor", label: "Impor" },
    { href: "/ringkasan", label: "Ringkasan" },
    { href: "/admin/gudang", label: "Gudang" },
  ],
  operator: [
    { href: "/pengiriman-gudang", label: "Pengiriman Gudang" },
    { href: "/ringkasan", label: "Ringkasan" },
    { href: "/kalender", label: "Kalender" },
  ],
  viewer: [
    { href: "/ringkasan", label: "Ringkasan" },
    { href: "/kalender", label: "Kalender" },
  ],
};

const fokusTerlihat = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Kartu({ kartu, bulanBerjalan }: { kartu: KartuPerluTindakan; bulanBerjalan: string }) {
  const { label, tujuan, ikon: Ikon } = tampilanKartu[kartu.jenis];
  const keterangan =
    kartu.gudang !== undefined
      ? [kartu.gudang.nama, kartu.tanggalKirim ? formatTanggal(kartu.tanggalKirim) : null].filter(Boolean).join(" · ")
      : kartu.jenis === "ranking-bulan-berjalan"
        ? formatBulanLaporan(bulanBerjalan)
        : null;
  return (
    <li>
      <Link
        href={kartu.href}
        data-kartu={kartu.jenis}
        data-jumlah={kartu.jumlah}
        className={cn(
          "flex h-full flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-soft transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary hover:shadow-float",
          fokusTerlihat,
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Ikon aria-hidden strokeWidth={2} className="size-7" />
        </span>
        <span className="font-heading text-4xl font-bold text-foreground tabular-nums">{formatAngka(kartu.jumlah)}</span>
        <span className="flex flex-col gap-1">
          <span className="font-semibold text-foreground">{label}</span>
          {keterangan ? <span className="text-muted-foreground">{keterangan}</span> : null}
          <span className="text-sm font-semibold text-primary">Buka {tujuan}</span>
        </span>
      </Link>
    </li>
  );
}

/** Keadaan kosong (DESIGN §7): ikon + teks, token `success`. */
function SemuaBeres() {
  return (
    <p data-semua-beres className="flex items-center gap-3 text-lg font-semibold text-foreground">
      <CircleCheck aria-hidden strokeWidth={2} className="size-7 shrink-0 text-success" />
      Semua beres. Tidak ada yang perlu ditindak saat ini.
    </p>
  );
}

function PerluTindakan({ kartu, bulanBerjalan }: { kartu: KartuPerluTindakan[]; bulanBerjalan: string }) {
  return (
    <section aria-labelledby="judul-perlu-tindakan" className="flex flex-col gap-6">
      <h2 id="judul-perlu-tindakan" className="text-2xl font-bold md:text-3xl">
        Perlu tindakan
      </h2>
      {kartu.length === 0 ? (
        <SemuaBeres />
      ) : (
        <ul aria-label="Perlu tindakan" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {kartu.map((k) => (
            <Kartu key={`${k.jenis}-${k.gudang?.id ?? ""}`} kartu={k} bulanBerjalan={bulanBerjalan} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Satu baris kecil: impor aktif terakhir dan status cache laporan (T33). */
function StatusData({ statusData }: { statusData: IsiBeranda["statusData"] }) {
  const { imporAktifTerakhir, statusCache } = statusData;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <p data-status-data>
        {imporAktifTerakhir === null ? (
          "Belum ada impor aktif."
        ) : (
          <>
            Impor aktif terakhir: <span className="font-semibold text-foreground">{imporAktifTerakhir.namaSheet}</span> (
            {imporAktifTerakhir.namaFile}) · {formatBulanImpor(imporAktifTerakhir.tahunImpor, imporAktifTerakhir.bulanImpor)}
            {imporAktifTerakhir.diaktifkanPada ? ` · diaktifkan ${formatWaktu(imporAktifTerakhir.diaktifkanPada)}` : ""}
          </>
        )}
      </p>
      {statusCache ? <StatusCacheLaporan status={statusCache} /> : null}
    </div>
  );
}

function Pintasan({ peran }: { peran: PeranTampil }) {
  return (
    <nav aria-label="Pintasan" className="flex flex-wrap gap-3">
      {pintasanPeran[peran].map((p, i) => (
        <Link
          key={p.href}
          href={p.href}
          className={cn(buttonVariants({ size: "lg", variant: i === 0 ? "default" : "outline" }), "hover:scale-105 active:scale-95")}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function Beranda() {
  const pengguna = await wajibMasuk();
  const hariIni = tanggalWib(new Date());
  const bulanBerjalan = hariIni.slice(0, 7);
  const isi = await muatIsiBeranda(pengguna, hariIni);
  const namaGudang = isi.gudangDitugaskan.map((g) => g.nama).join(", ");

  return (
    <main className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-32 -right-24 size-96 rounded-full bg-clay/20 blur-3xl" />
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-16 text-base sm:px-6 md:py-24 lg:px-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">Selamat datang, {pengguna.nama}</h1>
          <p data-peran={isi.peran} className="text-lg text-muted-foreground">
            <span>{labelPeran[isi.peran]}</span>
            {namaGudang ? <span> · {namaGudang}</span> : null}
          </p>
        </header>

        {isi.kartu === null ? null : <PerluTindakan kartu={isi.kartu} bulanBerjalan={bulanBerjalan} />}

        <StatusData statusData={isi.statusData} />

        <Pintasan peran={isi.peran} />
      </div>
    </main>
  );
}
