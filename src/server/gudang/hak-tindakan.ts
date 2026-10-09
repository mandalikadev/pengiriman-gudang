// Konstanta murni (tanpa database) agar bisa dipakai skema dan komponen klien.

/** Hak tindakan operator per gudang (PRD A3). */
export const daftarHakTindakan = ["kelola-usulan-jadwal", "input-stok", "hitung-kebutuhan", "finalisasi", "ekspor"] as const;
export type HakTindakan = (typeof daftarHakTindakan)[number];
