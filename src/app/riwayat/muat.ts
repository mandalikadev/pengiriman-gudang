import { notFound } from "next/navigation";

import type { PenggunaMasuk } from "@/server/auth/kewenangan";
import { daftarGudangDapatDilihat } from "@/server/gudang/akses";
import { bacaRincianRencanaFinal, gudangRencanaFinal } from "@/server/gudang/rencana-final";

// Pemuat halaman Riwayat (T127; PRD A7 ▶ Keputusan 2026-10-14, OD-07). Riwayat diperlakukan sebagai laporan: semua
// pengguna yang sudah masuk melihat rencana final semua gudang, termasuk gudang nonaktif. Akses ini hanya untuk
// melihat riwayat; halaman kerja gudang tetap memakai `wajibAksesLihatGudang`. Ekspor per rencana tetap butuh hak
// tindakan `ekspor` di gudang rencana itu (PRD A7 ▶ Keputusan 2026-10-09), dihitung dengan aturan yang sama dengan route
// ekspor (gudang nonaktif tidak memberi hak).

const ID_VALID = /^\d{1,9}$/;

/** Id gudang tempat `pengguna` punya hak tindakan `ekspor`. */
export async function gudangBolehEkspor(pengguna: PenggunaMasuk): Promise<ReadonlySet<number>> {
  const daftar = await daftarGudangDapatDilihat(pengguna);
  return new Set(daftar.filter((g) => g.hakTindakan.includes("ekspor")).map((g) => g.id));
}

/** Gudang yang barisnya ikut diekspor dari halaman Riwayat; lihat `cakupanEksporRiwayat`. */
export type CakupanEksporRiwayat = { semuaGudang: true } | { semuaGudang: false; gudang: ReadonlySet<number> };

/**
 * Cakupan ekspor halaman Riwayat (T129, PRD A7 ▶ Keputusan 2026-10-14): admin semua gudang tanpa penugasan (ekspor ini
 * hanya membaca catatan); pengguna lain hanya gudang tempat ia punya hak `ekspor` (gudang nonaktif tidak memberi hak).
 * `null` = tidak boleh mengekspor sama sekali (viewer, operator tanpa hak `ekspor` di gudang mana pun).
 */
export async function cakupanEksporRiwayat(pengguna: PenggunaMasuk): Promise<CakupanEksporRiwayat | null> {
  if (pengguna.peran === "admin") return { semuaGudang: true };
  const gudang = await gudangBolehEkspor(pengguna);
  return gudang.size === 0 ? null : { semuaGudang: false, gudang };
}

/** `true` bila baris gudang `idGudang` ikut diekspor dengan `cakupan`. */
export function ikutDiekspor(cakupan: CakupanEksporRiwayat, idGudang: number): boolean {
  return cakupan.semuaGudang || cakupan.gudang.has(idGudang);
}

/**
 * Nama gudang (urut `pilihanGudang`) yang punya baris di hasil filter (`idGudangHasil`) tetapi tidak ikut diekspor
 * dengan `cakupan`, untuk pemberitahuan sebelum ekspor dan baris keterangan berkas.
 */
export function gudangTidakIkutDiekspor(
  cakupan: CakupanEksporRiwayat,
  idGudangHasil: Iterable<number>,
  pilihanGudang: readonly { id: number; nama: string }[],
): string[] {
  const diHasil = new Set(idGudangHasil);
  return pilihanGudang.filter((g) => diHasil.has(g.id) && !ikutDiekspor(cakupan, g.id)).map((g) => g.nama);
}

/** Rincian rencana final `idRencana` dari snapshot, beserta status aktif gudangnya sekarang; 404 bila tidak ada. */
export async function muatRincianRencanaFinal(idRencana: string) {
  if (!ID_VALID.test(idRencana)) notFound();
  const gudang = await gudangRencanaFinal(Number(idRencana));
  if (gudang === null) notFound();
  const rencana = await bacaRincianRencanaFinal(gudang.id, Number(idRencana));
  if (rencana === null) notFound();
  return { gudangAktif: gudang.aktif, rencana };
}
