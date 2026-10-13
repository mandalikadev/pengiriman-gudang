import { CircleCheck, CircleMinus, CircleX, type LucideIcon } from "lucide-react";

import { Badge, type NadaBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { HasilBarisUnggah, JumlahUnggah } from "./aksi";

// Hasil unggahan tabel alias per baris (CODING_STANDARDS "Operasi massal mengembalikan hasil per item").
// Status ikon + teks (DESIGN §7). "Sudah ada" belum punya baris di DESIGN §7: token muted + CircleMinus (tidak berubah).
const keadaanBaris = {
  ditambahkan: { label: "Ditambahkan", nada: "success", ikon: CircleCheck },
  sudahAda: { label: "Sudah ada", nada: "muted", ikon: CircleMinus },
  ditolak: { label: "Ditolak", nada: "destructive", ikon: CircleX },
} as const satisfies Record<HasilBarisUnggah["keadaan"], { label: string; nada: NadaBadge; ikon: LucideIcon }>;

function BadgeKeadaan({ keadaan }: { keadaan: HasilBarisUnggah["keadaan"] }) {
  const { label, nada, ikon: Ikon } = keadaanBaris[keadaan];
  return (
    <Badge variant={nada} data-status={keadaan}>
      <Ikon aria-hidden strokeWidth={2} />
      {label}
    </Badge>
  );
}

export function HasilUnggahan({ baris, jumlah }: { baris: HasilBarisUnggah[]; jumlah: JumlahUnggah }) {
  return (
    <section aria-label="Hasil unggahan tabel alias" className="flex flex-col gap-3">
      <p className="font-semibold tabular-nums">
        {`Hasil unggahan: ${jumlah.ditambahkan} ditambahkan, ${jumlah.sudahAda} sudah ada, ${jumlah.ditolak} ditolak.`}
      </p>
      {baris.length === 0 ? (
        <p className="text-muted-foreground">File tidak berisi baris alias.</p>
      ) : (
        <Table aria-label="Hasil per baris" panjang>
          <TableHeader>
            <TableRow>
              <TableHead angka>Baris</TableHead>
              <TableHead>Alias</TableHead>
              <TableHead>Kode produk</TableHead>
              <TableHead>Keadaan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {baris.map((b) => (
              <TableRow key={b.nomor}>
                <TableCell angka>{b.nomor}</TableCell>
                <TableCell className="whitespace-normal">{b.alias}</TableCell>
                <TableCell className="font-semibold">{b.kodeProduk}</TableCell>
                <TableCell className="whitespace-normal">
                  <span className="flex flex-wrap items-center gap-2">
                    <BadgeKeadaan keadaan={b.keadaan} />
                    {b.keadaan === "ditolak" ? <span>{b.alasan}</span> : null}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
