"use client";

import { CircleDashed, Copy, Store } from "lucide-react";
import { useState } from "react";

import { formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import { BadgeStatusToko } from "@/app/admin/toko/baris-toko";
import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogIsi } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/domain/kalender";
import type { EntriRiwayatJadwal, TokoDenganJadwal } from "@/server/gudang/jadwal";
import { isianDariJadwal, labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";

import { FormJadwalTetap } from "./form-jadwal-tetap";
import { FormSalinJadwal, JUDUL_SALIN_JADWAL } from "./form-salin-jadwal";
import { RiwayatJadwalTetap } from "./riwayat-jadwal-tetap";

/** Satu toko terhubung beserta jadwal tetap aktif dan riwayatnya (terbaru di atas). */
export type TokoJadwalTetap = TokoDenganJadwal & { riwayat: EntriRiwayatJadwal[] };

/** Tabel lebih dari ±15 baris memakai pola tabel panjang (DESIGN §11.1). */
const BATAS_TABEL_PENDEK = 15;

/** Panel yang terbuka: jadwal satu toko, atau salin jadwal. Hanya satu panel terbuka pada satu waktu (DESIGN §11.2). */
type Panel = { jenis: "toko"; idToko: number } | { jenis: "salin" } | null;

function BadgeTanpaJadwal() {
  return (
    <Badge variant="muted" data-status="belumAdaJadwal">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5" />
      Belum ada jadwal
    </Badge>
  );
}

/** Kolom waktu di tabel: tanggal singkat, waktu lengkap saat disorot (DESIGN §11.6). */
function WaktuSingkat({ waktu }: { waktu: Date }) {
  return (
    <time dateTime={waktu.toISOString()} title={formatWaktu(waktu)}>
      {formatTanggal(tanggalWib(waktu))}
    </time>
  );
}

/**
 * Tabel jadwal tetap per toko (T112, PRD A5 ▶ Revisi 2026-10-13) dengan tombol "Atur jadwal" per toko dan "Salin jadwal
 * ke beberapa toko". Keduanya membuka panel samping (DESIGN §11.2) tanpa memuat ulang halaman. Panel dirender di luar
 * tabel karena isinya tidak memakai portal (lihat `dialog.tsx`).
 */
export function TabelJadwalTetap({ idGudang, daftarToko }: { idGudang: number; daftarToko: TokoJadwalTetap[] }) {
  const [panel, setPanel] = useState<Panel>(null);
  const tokoTerbuka = panel?.jenis === "toko" ? daftarToko.find((t) => t.id === panel.idToko) : undefined;

  if (daftarToko.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-3xl border border-border/60 bg-card p-6 shadow-soft">
        <p className="flex items-center gap-2 font-semibold">
          <Store aria-hidden strokeWidth={2} className="size-5 text-muted-foreground" />
          Belum ada toko yang terhubung ke gudang ini.
        </p>
        <p className="text-muted-foreground">Hubungkan toko ke gudang ini di halaman Pengaturan › Gudang.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Toko terhubung</h2>
        <Button type="button" variant="outline" data-buka-salin-jadwal onClick={() => setPanel({ jenis: "salin" })}>
          <Copy aria-hidden strokeWidth={2} className="size-5" />
          {JUDUL_SALIN_JADWAL}
        </Button>
      </div>

      <Table aria-label="Jadwal tetap per toko" panjang={daftarToko.length > BATAS_TABEL_PENDEK} kolomMenempel={1}>
        <TableHeader>
          <TableRow>
            <TableHead>Toko</TableHead>
            <TableHead>Status toko</TableHead>
            <TableHead>Jadwal tetap</TableHead>
            <TableHead>Pola</TableHead>
            <TableHead>Hari kirim (persiapan)</TableHead>
            <TableHead>Tanggal jangkar</TableHead>
            <TableHead>Diatur</TableHead>
            <TableHead>Tindakan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {daftarToko.map((t) => (
            <TableRow key={t.id} data-jadwal-toko={t.id} data-state={tokoTerbuka?.id === t.id ? "selected" : undefined}>
              <TableCell className="font-semibold">{t.nama}</TableCell>
              <TableCell>
                <BadgeStatusToko aktif={t.aktif} />
              </TableCell>
              <TableCell>{t.jadwal ? <BadgeStatus status="aktif" /> : <BadgeTanpaJadwal />}</TableCell>
              <TableCell>{t.jadwal ? labelPola[t.jadwal.pola] : "—"}</TableCell>
              <TableCell className="whitespace-normal">{t.jadwal ? labelHariKirim(t.jadwal.hariKirim) : "—"}</TableCell>
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
              <TableCell>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Atur jadwal ${t.nama}`}
                  data-atur-jadwal={t.id}
                  onClick={() => setPanel({ jenis: "toko", idToko: t.id })}
                >
                  Atur jadwal
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={panel !== null}
        onOpenChange={(buka) => {
          if (!buka) setPanel(null);
        }}
      >
        {panel?.jenis === "salin" ? (
          <DialogIsi bentuk="samping" judul={JUDUL_SALIN_JADWAL}>
            <FormSalinJadwal idGudang={idGudang} daftarToko={daftarToko.map((t) => ({ id: t.id, nama: t.nama }))} />
          </DialogIsi>
        ) : tokoTerbuka ? (
          <DialogIsi bentuk="samping" judul={`Jadwal tetap ${tokoTerbuka.nama}`}>
            <FormJadwalTetap
              key={tokoTerbuka.id}
              idGudang={idGudang}
              toko={{
                id: tokoTerbuka.id,
                nama: tokoTerbuka.nama,
                jadwal: tokoTerbuka.jadwal ? isianDariJadwal(tokoTerbuka.jadwal) : null,
              }}
            />
            <RiwayatJadwalTetap riwayat={tokoTerbuka.riwayat} />
          </DialogIsi>
        ) : null}
      </Dialog>
    </>
  );
}
