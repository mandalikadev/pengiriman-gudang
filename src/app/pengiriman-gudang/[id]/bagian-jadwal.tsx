import { Archive, CalendarClock, CircleDashed } from "lucide-react";
import Link from "next/link";

import { BadgeStatusPengiriman, teksJenis, teksTanggalKirim } from "@/app/usulan-jadwal/tampilan-pengiriman";
import { BadgeStatus } from "@/components/badge-status";
import { BantuanIstilah } from "@/components/bantuan-istilah";
import { Badge } from "@/components/ui/badge";
import { tautanTombolVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WaktuSingkat } from "@/components/waktu-singkat";
import { formatTanggal } from "@/domain/kalender";
import type { TokoDenganJadwal } from "@/server/gudang/jadwal";
import type { EntriPengirimanDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";

import { HREF_HALAMAN_JADWAL } from "./halaman-jadwal";
import { KartuLipat } from "./kartu-lipat";

function BadgeTanpaJadwal() {
  return (
    <Badge variant="muted" data-status="belumAdaJadwal">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5" />
      Belum ada jadwal
    </Badge>
  );
}

/** Status toko (toko terhubung, T50): Aktif, atau Nonaktif (ikon + teks, DESIGN §7). */
function BadgeStatusToko({ aktif }: { aktif: boolean }) {
  if (aktif) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted" data-status="tokoNonaktif">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}

const kelasTautan = tautanTombolVariants({ garisBawah: true });

/** Pengiriman di luar jadwal yang akan datang satu toko (menunggu dan berlaku), dengan statusnya. */
function SelDiLuarJadwal({ daftar }: { daftar: EntriPengirimanDiLuarJadwal[] | undefined }) {
  if (!daftar || daftar.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-col gap-2">
      {daftar.map((p) => (
        <li key={p.id} className="flex flex-col gap-1" data-pengiriman={p.id}>
          <BadgeStatusPengiriman status={p.status} />
          <span>
            {teksTanggalKirim(p)} · {teksJenis(p)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Bagian Jadwal halaman Pengiriman Gudang (T55; T113, PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas): jadwal tetap
 * setiap toko terhubung ditambah pengiriman di luar jadwal yang akan datang (menunggu dan berlaku) beserta statusnya.
 * `tautan` = pengguna punya hak `kelola-usulan-jadwal` di gudang ini: tampil tautan "Kirim di luar jadwal". Hak diperiksa
 * lagi di halaman tujuan dan server action. T118 (DESIGN §11.5): kolom Status toko menggantikan tabel "Toko terhubung"
 * yang terpisah; bagian ini bisa dibuka-tutup dan awalnya tertutup.
 */
export function BagianJadwal({
  idGudang,
  daftarToko,
  diLuarJadwalPerToko,
  tautan,
}: {
  idGudang: number;
  daftarToko: TokoDenganJadwal[];
  diLuarJadwalPerToko: Map<number, EntriPengirimanDiLuarJadwal[]>;
  tautan: boolean;
}) {
  const jumlahKolom = 8;
  return (
    <KartuLipat
      idJudul="jadwal-judul"
      judul="Jadwal toko"
      Ikon={CalendarClock}
      deskripsi="Hari kirim setiap toko beserta persiapannya (H, H−1, atau H−2). Setiap toko punya paling banyak satu jadwal aktif."
      data-jadwal
    >
      <Table aria-label="Jadwal aktif per toko">
        <TableHeader>
          <TableRow>
            <TableHead>Toko</TableHead>
            <TableHead>Status toko</TableHead>
            <TableHead>Status jadwal</TableHead>
            <TableHead>Pola</TableHead>
            <TableHead>Hari kirim (persiapan)</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Tanggal jangkar
                <BantuanIstilah istilah="tanggalJangkar" />
              </span>
            </TableHead>
            <TableHead>Diatur</TableHead>
            <TableHead>Di luar jadwal (akan datang)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {daftarToko.length === 0 ? (
            <TableRow>
              <TableCell colSpan={jumlahKolom} className="text-muted-foreground">
                Belum ada toko yang terhubung ke gudang ini.
              </TableCell>
            </TableRow>
          ) : (
            daftarToko.map((t) => (
              <TableRow key={t.id} data-jadwal-toko={t.id}>
                <TableCell className="font-semibold">{t.nama}</TableCell>
                <TableCell data-status-toko={t.aktif ? "aktif" : "nonaktif"}>
                  <BadgeStatusToko aktif={t.aktif} />
                </TableCell>
                <TableCell>{t.jadwal ? <BadgeStatus status="aktif" /> : <BadgeTanpaJadwal />}</TableCell>
                <TableCell>{t.jadwal ? labelPola[t.jadwal.pola] : "—"}</TableCell>
                <TableCell className="whitespace-normal">
                  {t.jadwal ? labelHariKirim(t.jadwal.hariKirim) : "—"}
                </TableCell>
                <TableCell>{t.jadwal?.tanggalJangkar ? formatTanggal(t.jadwal.tanggalJangkar) : "—"}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {t.jadwal ? (
                    <>
                      {t.jadwal.diaturOleh}, <WaktuSingkat waktu={t.jadwal.diaturPada} />
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="whitespace-normal" data-di-luar-jadwal-toko={t.id}>
                  <SelDiLuarJadwal daftar={diLuarJadwalPerToko.get(t.id)} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {tautan ? (
        <div className="flex flex-wrap gap-2">
          <Link href={`${HREF_HALAMAN_JADWAL}/${idGudang}`} data-tautan-jadwal className={kelasTautan}>
            Kirim di luar jadwal
          </Link>
        </div>
      ) : null}
    </KartuLipat>
  );
}
