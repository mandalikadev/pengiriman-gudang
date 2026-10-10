// Konstanta murni (tanpa database) agar bisa dipakai skema, server action, dan komponen klien (T55, PRD A5).

import type { Jadwal, MasukanJadwal } from "@/domain/jadwal";

export type PolaJadwal = MasukanJadwal["pola"];
export type Persiapan = MasukanJadwal["hariKirim"][number]["persiapan"];
export type HariKirim = Jadwal["hariKirim"][number]["hari"];

export const daftarPolaJadwal = ["mingguan", "2x-seminggu", "3x-seminggu", "dua-mingguan"] as const satisfies readonly PolaJadwal[];

export const daftarPersiapan = ["H", "H-1", "H-2"] as const satisfies readonly Persiapan[];

/** Hari kirim Senin–Sabtu (PRD A5), urutan tampil dan urutan simpan. */
export const daftarHariKirim = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const satisfies readonly HariKirim[];

export const labelPola: Record<PolaJadwal, string> = {
  mingguan: "Mingguan",
  "2x-seminggu": "2× seminggu",
  "3x-seminggu": "3× seminggu",
  "dua-mingguan": "Dua mingguan",
};

/** Persiapan tersimpan (jumlah hari) → pilihan form `H` / `H-1` / `H-2`. */
export const persiapanDariHari: Record<0 | 1 | 2, Persiapan> = { 0: "H", 1: "H-1", 2: "H-2" };

/** Teks tampil persiapan, mis. `H−2` (tanda minus seperti PRD A5). */
export const labelPersiapan: Record<Persiapan, string> = { H: "H", "H-1": "H−1", "H-2": "H−2" };

/** Teks hari kirim beserta persiapannya, mis. `Senin (H−2), Kamis (H)`. */
export function labelHariKirim(hariKirim: Jadwal["hariKirim"]) {
  return hariKirim.map((h) => `${h.hari} (${labelPersiapan[persiapanDariHari[h.persiapanHari]]})`).join(", ");
}
