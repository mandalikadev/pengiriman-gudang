import { Archive, History } from "lucide-react";

import { formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { formatTanggal } from "@/domain/kalender";
import type { EntriRiwayatJadwal } from "@/server/gudang/jadwal";
import { labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";

// T112 (PRD A5 ▶ Revisi 2026-10-13): riwayat jadwal tetap satu toko, terbaru di atas. DESIGN §7: status selalu ikon +
// teks. Jadwal yang diganti atau dinonaktifkan memakai token muted dan ikon Archive, sama dengan status nonaktif lain.

const labelBerakhir = { diganti: "Diganti", dinonaktifkan: "Dinonaktifkan" } as const;

function BadgeRiwayat({ berakhir }: { berakhir: EntriRiwayatJadwal["berakhir"] }) {
  if (berakhir === null) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted" data-status={berakhir.jenis}>
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      {labelBerakhir[berakhir.jenis]}
    </Badge>
  );
}

/** Daftar riwayat jadwal tetap: pola dan hari, diatur oleh dan kapan, diganti/dinonaktifkan oleh dan kapan. */
export function RiwayatJadwalTetap({ riwayat }: { riwayat: EntriRiwayatJadwal[] }) {
  return (
    <section aria-labelledby="riwayat-jadwal-judul" className="flex flex-col gap-3 border-t border-border/60 pt-4">
      <h3 id="riwayat-jadwal-judul" className="flex items-center gap-2 text-base font-semibold">
        <History aria-hidden strokeWidth={2} className="size-5 text-primary" />
        Riwayat jadwal tetap
      </h3>
      {riwayat.length === 0 ? (
        <p className="text-muted-foreground">Toko ini belum pernah punya jadwal tetap.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {riwayat.map((r) => (
            <li key={r.id} data-riwayat-jadwal={r.id} className="flex flex-col gap-1 rounded-2xl border border-border/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <BadgeRiwayat berakhir={r.berakhir} />
                <span className="font-semibold">{labelPola[r.pola]}</span>
              </div>
              <span>{labelHariKirim(r.hariKirim)}</span>
              {r.tanggalJangkar !== null ? <span>Tanggal jangkar: {formatTanggal(r.tanggalJangkar)}</span> : null}
              <span className="text-muted-foreground">
                Diatur oleh {r.diaturOleh}, {formatWaktu(r.diaturPada)}
              </span>
              {r.berakhir !== null ? (
                <span className="text-muted-foreground">
                  {labelBerakhir[r.berakhir.jenis]} oleh {r.berakhir.oleh}, {formatWaktu(r.berakhir.pada)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
