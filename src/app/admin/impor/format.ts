import { formatTanggal, parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";

export const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** Mis. `Juni 2026`. */
export function formatBulanImpor(tahun: number, bulan: number) {
  return `${NAMA_BULAN[bulan - 1]} ${tahun}`;
}

/** Kode bulan laporan `YYYY-MM` → mis. `Juni 2026`. */
export function formatBulanLaporan(kode: string) {
  return formatBulanImpor(Number(kode.slice(0, 4)), Number(kode.slice(5, 7)));
}

export function formatAngka(nilai: number) {
  return nilai.toLocaleString("id-ID");
}

const formatTanggalWib = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const formatJamWib = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Tanggal kalender (WIB) dari suatu waktu kejadian, mis. untuk "hari ini". */
export function tanggalWib(waktu: Date): TanggalBisnis {
  return parseTanggalBisnis(formatTanggalWib.format(waktu));
}

/** Waktu kejadian (bukan tanggal bisnis) dalam WIB, mis. `Jumat, 09-10-2026 pukul 14.05 WIB`. */
export function formatWaktu(waktu: Date) {
  const tanggal = formatTanggal(tanggalWib(waktu));
  return `${tanggal} pukul ${formatJamWib.format(waktu).replace(":", ".")} WIB`;
}
