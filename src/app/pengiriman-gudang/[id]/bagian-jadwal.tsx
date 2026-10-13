import { CalendarClock, CircleDashed } from "lucide-react";
import Link from "next/link";

import { formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/domain/kalender";
import type { TokoDenganJadwal } from "@/server/gudang/jadwal";
import { labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";
import type { UsulanTerakhir } from "@/server/gudang/usulan-jadwal";

import type { JalurJadwal } from "./form-jadwal";
import { HREF_HALAMAN_JADWAL, judulJadwalToko } from "./halaman-jadwal";
import { BadgeStatusUsulan, labelJenisUsulan } from "./status-usulan";

function BadgeTanpaJadwal() {
  return (
    <Badge variant="muted" data-status="belumAdaJadwal">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5" />
      Belum ada jadwal
    </Badge>
  );
}

const kelasTautan =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary underline underline-offset-4 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function SelUsulan({ usulan }: { usulan: UsulanTerakhir | undefined }) {
  if (!usulan) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-1">
      <BadgeStatusUsulan status={usulan.status} />
      <span>{labelJenisUsulan[usulan.jenis]}</span>
      <span className="text-muted-foreground">
        Diusulkan {usulan.diusulkanOleh}, {formatWaktu(usulan.diusulkanPada)}
      </span>
      {usulan.alasanPenolakan !== null ? <span>Alasan penolakan: {usulan.alasanPenolakan}</span> : null}
    </div>
  );
}

/**
 * Bagian Jadwal (T55, T56; PRD A5 ▶ OD-06): setiap toko terhubung beserta jadwal aktifnya. `usulanPerToko` (gudang
 * selain Pusat) menambah kolom status usulan terakhir setiap toko. Dipakai di halaman Pengiriman Gudang dan halaman
 * jadwal toko (T98). Form satu toko berada di halaman sendiri; `tautan` (jalur pengguna dengan hak
 * `kelola-usulan-jadwal`: Pusat mengatur langsung, gudang lain mengusulkan) menampilkan tautan ke halaman itu. Salin
 * jadwal pindah ke halaman admin Jadwal toko (T112). Hak diperiksa lagi di halaman dan server action.
 */
export function BagianJadwal({
  idGudang,
  daftarToko,
  usulanPerToko,
  tautan,
}: {
  idGudang: number;
  daftarToko: TokoDenganJadwal[];
  usulanPerToko: Map<number, UsulanTerakhir> | null;
  tautan: JalurJadwal | null;
}) {
  const jumlahKolom = usulanPerToko ? 7 : 6;
  return (
    <Card role="region" aria-labelledby="jadwal-judul" data-jadwal>
      <CardHeader>
        <h2 id="jadwal-judul" className="flex items-center gap-3 text-xl font-semibold">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarClock strokeWidth={2} className="size-5" />
          </span>
          Jadwal
        </h2>
        <CardDescription>
          Hari kirim setiap toko beserta persiapannya (H, H−1, atau H−2). Setiap toko punya paling banyak satu jadwal
          aktif.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Table aria-label="Jadwal aktif per toko">
          <TableHeader>
            <TableRow>
              <TableHead>Toko</TableHead>
              <TableHead>Status jadwal</TableHead>
              <TableHead>Pola</TableHead>
              <TableHead>Hari kirim (persiapan)</TableHead>
              <TableHead>Tanggal jangkar</TableHead>
              <TableHead>Diatur</TableHead>
              {usulanPerToko ? <TableHead>Usulan terakhir</TableHead> : null}
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
                  <TableCell>{t.jadwal ? <BadgeStatus status="aktif" /> : <BadgeTanpaJadwal />}</TableCell>
                  <TableCell>{t.jadwal ? labelPola[t.jadwal.pola] : "—"}</TableCell>
                  <TableCell className="whitespace-normal">
                    {t.jadwal ? labelHariKirim(t.jadwal.hariKirim) : "—"}
                  </TableCell>
                  <TableCell>{t.jadwal?.tanggalJangkar ? formatTanggal(t.jadwal.tanggalJangkar) : "—"}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {t.jadwal ? `${t.jadwal.diaturOleh}, ${formatWaktu(t.jadwal.diaturPada)}` : "—"}
                  </TableCell>
                  {usulanPerToko ? (
                    <TableCell className="whitespace-normal" data-usulan-toko={t.id}>
                      <SelUsulan usulan={usulanPerToko.get(t.id)} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {tautan !== null ? (
          <div className="flex flex-wrap gap-2">
            <Link href={`${HREF_HALAMAN_JADWAL}/${idGudang}`} data-tautan-jadwal className={kelasTautan}>
              {judulJadwalToko[tautan]}
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
