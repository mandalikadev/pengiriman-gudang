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

/** Rincian rencana final `idRencana` dari snapshot, beserta status aktif gudangnya sekarang; 404 bila tidak ada. */
export async function muatRincianRencanaFinal(idRencana: string) {
  if (!ID_VALID.test(idRencana)) notFound();
  const gudang = await gudangRencanaFinal(Number(idRencana));
  if (gudang === null) notFound();
  const rencana = await bacaRincianRencanaFinal(gudang.id, Number(idRencana));
  if (rencana === null) notFound();
  return { gudangAktif: gudang.aktif, rencana };
}
