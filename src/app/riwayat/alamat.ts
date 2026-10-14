// Alamat halaman Riwayat (T127; PRD A7 ▶ Keputusan 2026-10-14), dipakai halaman Riwayat, rincian rencana final, layar
// berhasil finalisasi, dan pengalihan alamat lama.

/** Halaman Riwayat, tab Rencana final; dengan `idGudang`, filter gudang itu sudah diterapkan. */
export function urlRiwayat(idGudang?: number) {
  return idGudang === undefined ? "/riwayat" : `/riwayat?${new URLSearchParams({ gudang: String(idGudang) }).toString()}`;
}

/** Halaman Riwayat, tab "Di luar jadwal" (T128). */
export function urlRiwayatDiLuarJadwal() {
  return "/riwayat?tab=di-luar-jadwal";
}

/** Rincian rencana final `idRencana`, dengan rincian satu baris terbuka di panel samping bila `kodeProduk` diberikan (T108). */
export function urlRincianRencanaFinal(idRencana: number | string, kodeProduk?: string) {
  const dasar = `/riwayat/rencana-final/${idRencana}`;
  if (kodeProduk === undefined) return dasar;
  return `${dasar}?${new URLSearchParams({ rincian: kodeProduk }).toString()}`;
}

/** Route ekspor satu rencana final (T64); tidak berubah oleh pindahnya riwayat ke halaman Riwayat. */
export function urlEksporRencanaFinal(idGudang: number, idRencana: number) {
  return `/pengiriman-gudang/${idGudang}/rencana-final/${idRencana}/ekspor`;
}
