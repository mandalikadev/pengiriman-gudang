import { Archive, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { AksesDitolakError, wajibAksesLihatGudang } from "@/server/auth/kewenangan";
import { tokoTerhubung } from "@/server/gudang/akses";
import { bacaRingkasanDraft, daftarTanggalDraft } from "@/server/gudang/draft-rencana";
import { jadwalTokoGudang } from "@/server/gudang/jadwal";
import { bacaPeriodeSumberPerhitungan } from "@/server/gudang/periode-sumber";
import { NAMA_GUDANG_PUSAT } from "@/server/gudang/seed-master";
import { usulanTerakhirPerToko } from "@/server/gudang/usulan-jadwal";

import { KeteranganHanyaBaca } from "../hanya-baca";
import { BagianDraft } from "./bagian-draft";
import { BagianJadwal } from "./bagian-jadwal";
import { KartuPeriodeSumber } from "./kartu-periode-sumber";

export const metadata: Metadata = {
  title: "Pengiriman Gudang — Dashboard Penjualan MANDALIKA",
};

/** Akses lihat diperiksa di server sebelum membaca data; tanpa akses atau id tidak dikenal mendapat 404. */
async function muatGudang(id: string) {
  if (!/^\d{1,9}$/.test(id)) notFound();
  try {
    return (await wajibAksesLihatGudang(Number(id))).gudang;
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
}

/** `?tanggal=YYYY-MM-DD` = draft yang dibuka; nilai lain diabaikan (draft terakhir dihitung yang tampil). */
function bacaTanggalDiminta(nilai: string | string[] | undefined): TanggalBisnis | null {
  if (typeof nilai !== "string") return null;
  try {
    return parseTanggalBisnis(nilai);
  } catch {
    return null;
  }
}

/** `?toko=<id toko>` = toko draft yang dibuka (T73); nilai lain diabaikan (tidak ada toko dibuka). */
function bacaTokoDiminta(nilai: string | string[] | undefined): number | null {
  return typeof nilai === "string" && /^\d{1,9}$/.test(nilai) ? Number(nilai) : null;
}

function BadgeStatusToko({ aktif }: { aktif: boolean }) {
  if (aktif) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}

/**
 * Zona kerja (DESIGN §1). Halaman Pengiriman Gudang satu gudang (T50) dengan kartu Periode sumber (T51) dan bagian
 * Jadwal (T55, T56). Operator dengan hak `kelola-usulan-jadwal` mendapat tautan ke halaman Usulkan/Atur jadwal toko dan
 * Salin jadwal (T98), tempat jadwal Pusat diubah langsung dan jadwal gudang lain diusulkan (PRD A5 ▶ OD-06). Bagian Draft rencana (T58)
 * menampilkan draft yang tersimpan tanpa menghitung saat halaman dibuka (PRD C1), sebagai ringkasan per toko; `?toko=<id>`
 * membuka baris satu toko (T73) dan `?rincian=<id toko>|<kode produk>` membuka rincian perhitungan satu barisnya (T60). Operator dengan hak `finalisasi` memfinalisasi rencana per toko (T62).
 * Tautan Riwayat rencana final (T63) untuk semua yang bisa melihat halaman ini.
 */
export default async function HalamanPengirimanGudang({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gudang = await muatGudang((await params).id);
  const parameter = await searchParams;
  const tanggalDiminta = bacaTanggalDiminta(parameter?.tanggal);
  const daftarToko = await tokoTerhubung(gudang.id);
  const periodeSumber = await bacaPeriodeSumberPerhitungan(gudang.id);
  const daftarJadwal = await jadwalTokoGudang(gudang.id);
  const pusat = gudang.nama === NAMA_GUDANG_PUSAT;
  const usulanPerToko = pusat ? null : await usulanTerakhirPerToko(gudang.id);
  const daftarTanggal = await daftarTanggalDraft(gudang.id);
  const draft = await bacaRingkasanDraft(gudang.id, tanggalDiminta ?? undefined, bacaTokoDiminta(parameter?.toko));
  // Tautan ke halaman jadwal toko (T98) hanya untuk pengguna dengan hak kelola-usulan-jadwal di gudang ini.
  const jalurJadwal = gudang.hakTindakan.includes("kelola-usulan-jadwal") ? (pusat ? "langsung" : "usulan") : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link
        href="/pengiriman-gudang"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar gudang
      </Link>
      <h1 className="text-2xl font-bold md:text-3xl">Pengiriman Gudang — {gudang.nama}</h1>
      <Link
        href={`/pengiriman-gudang/${gudang.id}/rencana-final`}
        data-tautan-riwayat-final
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary underline underline-offset-4 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Riwayat rencana final
      </Link>
      {gudang.hakTindakan.length === 0 ? (
        <KeteranganHanyaBaca>
          Hanya-baca: Anda bisa melihat halaman ini, tetapi tidak punya hak tindakan di gudang ini.
        </KeteranganHanyaBaca>
      ) : null}

      <KartuPeriodeSumber periode={periodeSumber} />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Toko terhubung</h2>
        <Table aria-label="Toko terhubung">
          <TableHeader>
            <TableRow>
              <TableHead>Toko</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarToko.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground">
                  Belum ada toko yang terhubung ke gudang ini.
                </TableCell>
              </TableRow>
            ) : (
              daftarToko.map((t) => (
                <TableRow key={t.id} data-id-toko={t.id}>
                  <TableCell className="font-semibold">{t.nama}</TableCell>
                  <TableCell>
                    <BadgeStatusToko aktif={t.aktif} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <BagianJadwal idGudang={gudang.id} daftarToko={daftarJadwal} usulanPerToko={usulanPerToko} tautan={jalurJadwal} />

      <BagianDraft
        idGudang={gudang.id}
        bolehHitung={gudang.hakTindakan.includes("hitung-kebutuhan")}
        bolehInputStok={gudang.hakTindakan.includes("input-stok")}
        bolehFinalisasi={gudang.hakTindakan.includes("finalisasi")}
        daftarTanggal={daftarTanggal}
        tanggalDiminta={tanggalDiminta}
        draft={draft}
        rincianDiminta={typeof parameter?.rincian === "string" ? parameter.rincian : null}
        tokoNonaktifBerjadwal={daftarJadwal.filter((t) => !t.aktif && t.jadwal !== null)}
      />
    </main>
  );
}
