import { CircleCheck, CircleX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { HasilDaftarSheet } from "@/server/impor/impor";

// Hasil pendaftaran per sheet setelah satu kiriman (PRD A1, Keputusan 2026-10-12; CODING_STANDARDS hasil per item).
// Status ikon + teks dengan token DESIGN §7: berhasil = success + CircleCheck, gagal = destructive + CircleX.
export function RingkasanHasilDaftar({ sheet }: { sheet: readonly HasilDaftarSheet[] }) {
  const berhasil = sheet.filter((s) => s.keadaan === "berhasil").length;
  return (
    <section aria-label="Hasil pendaftaran per sheet" className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-soft">
      <p className="font-semibold tabular-nums">{`Hasil unggahan: ${berhasil} sheet berhasil didaftarkan, ${sheet.length - berhasil} gagal.`}</p>
      <ul className="flex flex-col gap-2">
        {sheet.map((s) => (
          <li key={s.namaSheet} data-hasil-sheet={s.keadaan} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">{s.namaSheet}</span>
            {s.keadaan === "berhasil" ? (
              <Badge variant="success">
                <CircleCheck aria-hidden strokeWidth={2} className="size-5" />
                Berhasil didaftarkan
              </Badge>
            ) : (
              <>
                <Badge variant="destructive">
                  <CircleX aria-hidden strokeWidth={2} className="size-5" />
                  Gagal
                </Badge>
                <span>{`— ${s.pesan}`}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
