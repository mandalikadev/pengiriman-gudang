import { formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import { formatTanggal } from "@/domain/kalender";

/** Kolom waktu di tabel: tanggal singkat, waktu lengkap saat disorot lewat `title` (DESIGN §11.6, T121). */
export function WaktuSingkat({ waktu }: { waktu: Date }) {
  return (
    <time dateTime={waktu.toISOString()} title={formatWaktu(waktu)}>
      {formatTanggal(tanggalWib(waktu))}
    </time>
  );
}
