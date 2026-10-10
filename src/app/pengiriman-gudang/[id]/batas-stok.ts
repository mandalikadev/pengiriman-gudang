// Konstanta tanpa "use client"/"use server" agar dipakai server action dan form.

/**
 * Batas mutlak stok akhir yang diterima. Batas teknis: jumlah kirim disimpan sebagai `integer` PostgreSQL, dan
 * (kebutuhan − stok) × (100 + buffer) harus tetap aman.
 */
export const STOK_MAKS = 1_000_000_000;
