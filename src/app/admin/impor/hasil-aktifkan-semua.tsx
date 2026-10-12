import { CircleCheck, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";

import { Badge, type NadaBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HasilAktifkanSatuImpor } from "@/server/impor/impor";

import { formatBulanImpor } from "./format";

// DESIGN §7: status selalu ikon + teks; warna ikon dari token status, teks foreground. Diaktifkan = berhasil
// (success + CircleCheck), Gagal = gagal (destructive + CircleX), Dilewati = perlu perhatian (warning + TriangleAlert).
const tampilanKeadaan = {
  diaktifkan: { label: "Diaktifkan", nada: "success", ikon: CircleCheck },
  dilewati: { label: "Dilewati", nada: "warning", ikon: TriangleAlert },
  gagal: { label: "Gagal", nada: "destructive", ikon: CircleX },
} as const satisfies Record<HasilAktifkanSatuImpor["keadaan"], { label: string; nada: NadaBadge; ikon: LucideIcon }>;

/** Hasil per impor setelah "Aktifkan semua yang siap" (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export function HasilAktifkanSemua({ impor }: { impor: readonly HasilAktifkanSatuImpor[] }) {
  const jumlah = (keadaan: HasilAktifkanSatuImpor["keadaan"]) => impor.filter((h) => h.keadaan === keadaan).length;
  return (
    <section aria-label="Hasil aktifkan semua per impor" className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-soft">
      <p className="font-semibold tabular-nums">
        {`Hasil aktifkan semua: ${jumlah("diaktifkan")} diaktifkan, ${jumlah("dilewati")} dilewati, ${jumlah("gagal")} gagal.`}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sheet</TableHead>
            <TableHead>Bulan impor</TableHead>
            <TableHead>Keadaan</TableHead>
            <TableHead>Keterangan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {impor.map((h) => {
            const { label, nada, ikon: Ikon } = tampilanKeadaan[h.keadaan];
            return (
              <TableRow key={h.idImpor} data-hasil-aktifkan-impor={h.idImpor}>
                <TableCell className="whitespace-normal">
                  <span className="font-semibold">{h.namaSheet}</span>
                  <span className="block text-muted-foreground">{h.namaFile}</span>
                </TableCell>
                <TableCell>{formatBulanImpor(h.tahunImpor, h.bulanImpor)}</TableCell>
                <TableCell>
                  <Badge variant={nada} data-keadaan-aktifkan={h.keadaan}>
                    <Ikon aria-hidden strokeWidth={2} className="size-5" />
                    {label}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-normal">{h.keadaan === "diaktifkan" ? "Impor ini sekarang aktif." : h.pesan}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
