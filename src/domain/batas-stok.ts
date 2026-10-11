// Batas stok akhir, dipakai isian manual (T59), skema server action, dan pembaca file stok (T83).

/**
 * Batas mutlak stok akhir yang diterima. Batas teknis: jumlah kirim disimpan sebagai `integer` PostgreSQL, dan
 * (kebutuhan − stok) × (100 + buffer) harus tetap aman.
 */
export const STOK_MAKS = 1_000_000_000;
