import { formatWaktu } from "@/app/admin/impor/format";
import { formatTanggal } from "@/domain/kalender";
import type { KeteranganDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";

// Teks penanda pengiriman di luar jadwal (T114, PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas), dipakai draft, rencana
// final, riwayat, dan ekspor. Penyetuju kosong = langsung berlaku di gudang Pusat; teksnya sama dengan riwayat pengiriman
// di luar jadwal (T113).

/** "Di luar jadwal · Tambahan" atau "Di luar jadwal · Pindahan dari Senin, 19-10-2026". */
export function labelDiLuarJadwal(k: Pick<KeteranganDiLuarJadwal, "jenis" | "tanggalRutinDipindah">): string {
  const jenis = k.jenis === "pindah" && k.tanggalRutinDipindah !== null ? `Pindahan dari ${formatTanggal(k.tanggalRutinDipindah)}` : "Tambahan";
  return `Di luar jadwal · ${jenis}`;
}

/** "disetujui <nama>, <waktu>", atau "langsung berlaku (Pusat)". */
export function teksPenyetuju(k: Pick<KeteranganDiLuarJadwal, "penyetuju" | "disetujuiPada">): string {
  return k.penyetuju === null || k.disetujuiPada === null ? "langsung berlaku (Pusat)" : `disetujui ${k.penyetuju}, ${formatWaktu(k.disetujuiPada)}`;
}

/** Nilai baris keterangan "Jenis pengiriman" di ekspor: "Rutin", atau "<label> — <alasan> — <penyetuju>". */
export function teksJenisPengiriman(k: KeteranganDiLuarJadwal | null): string {
  return k === null ? "Rutin" : `${labelDiLuarJadwal(k)} — ${k.alasan} — ${teksPenyetuju(k)}`;
}
