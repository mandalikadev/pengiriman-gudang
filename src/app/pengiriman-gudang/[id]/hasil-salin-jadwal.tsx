import { CircleCheck, CircleX, ClipboardList, TriangleAlert, type LucideIcon } from "lucide-react";

import { Badge, type NadaBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { HasilSalinToko } from "@/server/gudang/salin-jadwal";

import type { JalurJadwal } from "./form-jadwal";

// DESIGN §7: status selalu ikon + teks; warna ikon dari token status, teks foreground. Hasil salin jadwal memakai token
// dan ikon yang sudah ada: berhasil = berhasil, ditolak = gagal, sudah ada usulan menunggu = menunggu tinjauan admin
// (sama dengan "Menunggu persetujuan" usulan), belum pasti = peringatan.
const tampilanHasil = {
  berhasil: { label: "Berhasil", nada: "success", ikon: CircleCheck },
  ditolak: { label: "Ditolak", nada: "destructive", ikon: CircleX },
  usulanMenunggu: { label: "Sudah ada usulan menunggu", nada: "default", ikon: ClipboardList },
  belumPasti: { label: "Belum pasti", nada: "warning", ikon: TriangleAlert },
} as const satisfies Record<HasilSalinToko["status"], { label: string; nada: NadaBadge; ikon: LucideIcon }>;

const keteranganBerhasil: Record<JalurJadwal, string> = {
  langsung: "Jadwal aktif toko sesuai pengaturan ini.",
  usulan: "Usulan dibuat dan menunggu persetujuan admin. Jadwal aktif toko tetap dipakai sampai disetujui.",
};

function BadgeHasilSalin({ status }: { status: HasilSalinToko["status"] }) {
  const { label, nada, ikon: Ikon } = tampilanHasil[status];
  return (
    <Badge variant={nada} data-hasil-salin={status}>
      <Ikon aria-hidden strokeWidth={2} className="size-5" />
      {label}
    </Badge>
  );
}

/** Hasil per toko setelah salin jadwal (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export function HasilSalinJadwal({
  jalur,
  hasil,
  namaToko,
}: {
  jalur: JalurJadwal;
  hasil: HasilSalinToko[];
  namaToko: ReadonlyMap<number, string>;
}) {
  const jumlahBerhasil = hasil.filter((h) => h.status === "berhasil").length;
  const semua = jumlahBerhasil === hasil.length;
  const IkonRingkasan = semua ? CircleCheck : TriangleAlert;
  return (
    <section aria-label="Hasil per toko" className="flex flex-col gap-3">
      <p role="status" className="flex items-start gap-2 font-semibold">
        <IkonRingkasan
          aria-hidden
          strokeWidth={2}
          className={cn("size-5 shrink-0", semua ? "text-success" : "text-warning")}
        />
        {jumlahBerhasil} dari {hasil.length} toko berhasil.
      </p>
      <Table aria-label="Hasil salin jadwal">
        <TableHeader>
          <TableRow>
            <TableHead>Toko</TableHead>
            <TableHead>Hasil</TableHead>
            <TableHead>Keterangan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasil.map((h) => (
            <TableRow key={h.idToko} data-hasil-salin-toko={h.idToko}>
              <TableCell className="font-semibold">{namaToko.get(h.idToko) ?? `Toko #${h.idToko}`}</TableCell>
              <TableCell>
                <BadgeHasilSalin status={h.status} />
              </TableCell>
              <TableCell className="whitespace-normal">
                {h.status === "berhasil" ? keteranganBerhasil[jalur] : h.pesan}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
