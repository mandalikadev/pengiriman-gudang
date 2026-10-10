import { CalendarClock, CircleDashed } from "lucide-react";

import { formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/domain/kalender";
import type { TokoDenganJadwal } from "@/server/gudang/jadwal";
import { labelHariKirim, labelPola, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";
import type { UsulanTerakhir } from "@/server/gudang/usulan-jadwal";

import type { IsianJadwal } from "./bidang-jadwal";
import { FormJadwal, type JalurJadwal } from "./form-jadwal";
import { FormSalinJadwal } from "./form-salin-jadwal";
import { BadgeStatusUsulan, labelJenisUsulan } from "./status-usulan";

function BadgeTanpaJadwal() {
  return (
    <Badge variant="muted" data-status="belumAdaJadwal">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5" />
      Belum ada jadwal
    </Badge>
  );
}

/** Jadwal aktif → isian form (persiapan dalam hari → `H` / `H-1` / `H-2`). */
function keIsian(jadwal: NonNullable<TokoDenganJadwal["jadwal"]>): IsianJadwal {
  return {
    pola: jadwal.pola,
    hariKirim: jadwal.hariKirim.map((h) => ({ hari: h.hari, persiapan: persiapanDariHari[h.persiapanHari] })),
    tanggalJangkar: jadwal.tanggalJangkar,
  };
}

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
 * Bagian Jadwal halaman Pengiriman Gudang (T55, T56, T57; PRD A5 ▶ OD-06): setiap toko terhubung beserta jadwal
 * aktifnya. `usulanPerToko` (gudang selain Pusat) menambah kolom status usulan terakhir setiap toko. Form satu toko dan
 * form salin jadwal ke beberapa toko tampil hanya untuk operator dengan hak `kelola-usulan-jadwal` (`jalur`: Pusat
 * mengatur langsung, gudang lain mengusulkan; diperiksa lagi di server); pengguna lain melihatnya hanya-baca.
 */
export function BagianJadwal({
  idGudang,
  daftarToko,
  usulanPerToko,
  jalur,
}: {
  idGudang: number;
  daftarToko: TokoDenganJadwal[];
  usulanPerToko: Map<number, UsulanTerakhir> | null;
  jalur: JalurJadwal | null;
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

        {jalur !== null && daftarToko.length > 0 ? (
          <>
            <FormJadwal
              idGudang={idGudang}
              jalur={jalur}
              daftarToko={daftarToko.map((t) => ({
                id: t.id,
                nama: t.nama,
                jadwal: t.jadwal ? keIsian(t.jadwal) : null,
                adaUsulanMenunggu: usulanPerToko?.get(t.id)?.status === "menunggu",
              }))}
            />
            <FormSalinJadwal idGudang={idGudang} jalur={jalur} daftarToko={daftarToko.map((t) => ({ id: t.id, nama: t.nama }))} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
