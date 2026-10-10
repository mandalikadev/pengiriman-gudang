// Konstanta murni (tanpa database) agar bisa dipakai skema, server, dan komponen.

import type { MasalahKirim } from "@/domain/pengiriman";

/**
 * Masalah satu baris draft yang menahan finalisasi: masalah mesin kebutuhan (T05) ditambah produk otomatis yang keluarga
 * aromanya belum dipetakan (PRD A6 ▶ Keputusan perencanaan M2–M3, ADR-0006).
 */
export type MasalahBarisDraft = MasalahKirim | "belum-dipetakan";

/**
 * Urutan tampilan masalah baris draft, termasuk letak `belum-dipetakan`: PRD A6 ▶ Keputusan (2026-10-10, T66).
 */
export const URUTAN_MASALAH = [
  "kebutuhan-tidak-tersedia",
  "belum-dipetakan",
  "stok-negatif",
  "stok-belum-diisi",
] as const satisfies readonly MasalahBarisDraft[];
