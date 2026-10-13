import { Archive, CircleCheck, CircleX, ClipboardList, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import { Badge, type NadaBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/domain/kalender";
import type { JenisPengirimanDiLuarJadwal, StatusPengirimanDiLuarJadwal } from "@/server/db/schema";
import type { EntriPengirimanDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { labelPersiapan, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";

// Tampilan pengiriman di luar jadwal (T113, PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas), dipakai halaman operator,
// Persetujuan jadwal, dan tabel jadwal Pengiriman Gudang. DESIGN §7: status selalu ikon + teks dengan token dan ikon yang
// sudah ada: menunggu = menunggu tinjauan admin (nada "Siap ditinjau"), berlaku = berhasil, ditolak = gagal, ditarik dan
// dibatalkan = tidak berlaku lagi (nada dan ikon "Dibatalkan"/"Diarsipkan").

const tampilanStatus = {
  menunggu: { label: "Menunggu", nada: "default", ikon: ClipboardList },
  berlaku: { label: "Berlaku", nada: "success", ikon: CircleCheck },
  ditolak: { label: "Ditolak", nada: "destructive", ikon: CircleX },
  ditarik: { label: "Ditarik", nada: "muted", ikon: Archive },
  dibatalkan: { label: "Dibatalkan", nada: "muted", ikon: Archive },
} as const satisfies Record<StatusPengirimanDiLuarJadwal, { label: string; nada: NadaBadge; ikon: LucideIcon }>;

export const labelJenisPengiriman: Record<JenisPengirimanDiLuarJadwal, string> = { tambahan: "Tambahan", pindah: "Pindah" };

export function BadgeStatusPengiriman({ status }: { status: StatusPengirimanDiLuarJadwal }) {
  const { label, nada, ikon: Ikon } = tampilanStatus[status];
  return (
    <Badge variant={nada} data-status-pengiriman={status}>
      <Ikon aria-hidden strokeWidth={2} className="size-5" />
      {label}
    </Badge>
  );
}

/** Jenis beserta tanggal rutin yang dipindah, mis. "Pindahan dari Senin, 19-10-2026". */
export function teksJenis(entri: Pick<EntriPengirimanDiLuarJadwal, "jenis" | "tanggalRutinDipindah">) {
  return entri.jenis === "pindah" && entri.tanggalRutinDipindah !== null
    ? `Pindahan dari ${formatTanggal(entri.tanggalRutinDipindah)}`
    : labelJenisPengiriman.tambahan;
}

/** Tanggal kirim beserta persiapannya, mis. "Selasa, 20-10-2026 (H−1)". */
export function teksTanggalKirim(entri: Pick<EntriPengirimanDiLuarJadwal, "tanggalKirim" | "persiapanHari">) {
  return `${formatTanggal(entri.tanggalKirim)} (${labelPersiapan[persiapanDariHari[entri.persiapanHari]]})`;
}

/** Kolom waktu di tabel: tanggal singkat, waktu lengkap saat disorot (DESIGN §11.6). */
function Waktu({ waktu }: { waktu: Date }) {
  return (
    <time dateTime={waktu.toISOString()} title={formatWaktu(waktu)}>
      {formatTanggal(tanggalWib(waktu))}
    </time>
  );
}

function Pelaku({ nama, waktu }: { nama: string; waktu: Date }) {
  return (
    <span className="flex flex-col">
      <span>{nama}</span>
      <span className="text-muted-foreground">
        <Waktu waktu={waktu} />
      </span>
    </span>
  );
}

function SelPemutus({ entri }: { entri: EntriPengirimanDiLuarJadwal }) {
  if (entri.pemutus !== null && entri.diputuskanPada !== null) return <Pelaku nama={entri.pemutus} waktu={entri.diputuskanPada} />;
  if (entri.gudangPusat && (entri.status === "berlaku" || entri.status === "dibatalkan")) {
    return <span className="text-muted-foreground">Langsung berlaku (Pusat)</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function SelKeterangan({ entri }: { entri: EntriPengirimanDiLuarJadwal }) {
  if (entri.status === "ditolak") return <span>Alasan penolakan: {entri.alasanPenolakan}</span>;
  if (entri.status === "ditarik" && entri.ditarikPada !== null) {
    return (
      <span>
        Ditarik pengusul, <Waktu waktu={entri.ditarikPada} />
      </span>
    );
  }
  if (entri.status === "dibatalkan" && entri.dibatalkanPada !== null) {
    return (
      <span className="flex flex-col">
        <span>Alasan pembatalan: {entri.alasanPembatalan}</span>
        <span className="text-muted-foreground">
          {entri.pembatal ?? "Otomatis oleh sistem"}, <Waktu waktu={entri.dibatalkanPada} />
        </span>
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

/** Tabel lebih dari ±15 baris memakai pola tabel panjang (DESIGN §11.1). */
const BATAS_TABEL_PENDEK = 15;

/**
 * Riwayat pengiriman di luar jadwal (catatan aktivitas PRD A5): status, jenis, toko, tanggal, alasan, pengusul, pemutus,
 * waktu, dan alasan penolakan/pembatalan, dalam urutan daftar yang diberikan. `tampilkanGudang` menambah kolom gudang
 * (halaman admin). `tindakan` mengisi kolom Tindakan per baris; tanpa `tindakan` kolom itu tidak ada.
 */
export function TabelRiwayatPengiriman({
  label,
  daftar,
  tampilkanGudang = false,
  tindakan,
  kosong,
}: {
  label: string;
  daftar: EntriPengirimanDiLuarJadwal[];
  tampilkanGudang?: boolean;
  tindakan?: (entri: EntriPengirimanDiLuarJadwal) => ReactNode;
  kosong: string;
}) {
  if (daftar.length === 0) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Inbox aria-hidden strokeWidth={2} className="size-5" />
        {kosong}
      </p>
    );
  }
  return (
    <Table aria-label={label} panjang={daftar.length > BATAS_TABEL_PENDEK} kolomMenempel={1}>
      <TableHeader>
        <TableRow>
          <TableHead>Toko</TableHead>
          {tampilkanGudang ? <TableHead>Gudang</TableHead> : null}
          <TableHead>Status</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead>Tanggal kirim (persiapan)</TableHead>
          <TableHead>Alasan</TableHead>
          <TableHead>Diusulkan</TableHead>
          <TableHead>Diputuskan</TableHead>
          <TableHead>Keterangan</TableHead>
          {tindakan ? <TableHead>Tindakan</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {daftar.map((e) => (
          <TableRow key={e.id} data-pengiriman={e.id}>
            <TableCell className="font-semibold">{e.toko}</TableCell>
            {tampilkanGudang ? <TableCell>{e.gudang}</TableCell> : null}
            <TableCell>
              <BadgeStatusPengiriman status={e.status} />
            </TableCell>
            <TableCell className="whitespace-normal">{teksJenis(e)}</TableCell>
            <TableCell>{teksTanggalKirim(e)}</TableCell>
            <TableCell className="min-w-48 whitespace-normal">{e.alasan}</TableCell>
            <TableCell>
              <Pelaku nama={e.pengusul} waktu={e.diusulkanPada} />
            </TableCell>
            <TableCell>
              <SelPemutus entri={e} />
            </TableCell>
            <TableCell className="min-w-48 whitespace-normal">
              <SelKeterangan entri={e} />
            </TableCell>
            {tindakan ? <TableCell>{tindakan(e)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
