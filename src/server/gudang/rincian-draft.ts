// Tipe murni (tanpa database) untuk rincian perhitungan baris draft (T60), dipakai skema, server, dan komponen.

import type { KategoriDasar } from "@/domain/kalender";
import type { RincianKebutuhan } from "@/domain/pengiriman";

/**
 * Asal kategori efektif satu tanggal cakupan (PRD B4): kategori dasar tanggal, perubahan kategori aktif untuk seluruh
 * toko, atau perubahan kategori aktif khusus toko itu.
 */
export type SumberKategoriDraft = "dasar" | "semua-toko" | "toko";

/** Satu tanggal cakupan toko di draft (`tanggal` = `YYYY-MM-DD`). */
export type TanggalCakupanDraft = { tanggal: string; kategoriEfektif: KategoriDasar; sumberKategori: SumberKategoriDraft };

/**
 * Dasar kebutuhan satu toko–varian saat draft dihitung: Rata-rata Ringkasan per kategori hari yang punya hasil di
 * periode sumber, dan kebutuhan per kategori efektif (jumlah hari × rata-rata; `null` = kebutuhan tidak tersedia).
 */
export type RincianBarisDraft = {
  rataRata: Partial<Record<KategoriDasar, number>>;
  kebutuhan: RincianKebutuhan[] | null;
};
