import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, type Peran } from "@/server/auth/auth";
import { daftarGudangDapatDilihat, type GudangDapatDilihat } from "@/server/gudang/akses";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";
import { punyaHakTindakan } from "@/server/gudang/penugasan";

// CODING_STANDARDS "Kewenangan": setiap server action dan route memeriksa peran di server,
// sebelum membaca atau menulis data. Menyembunyikan tombol di UI hanya tambahan.
// "Admin" tidak memberi hak operator; hak operator berasal dari penugasan gudang.

export type PenggunaMasuk = { id: string; nama: string; email: string; peran: Peran };

export class AksesDitolakError extends Error {
  constructor(pesan = "Hanya admin yang boleh melakukan tindakan ini.") {
    super(pesan);
    this.name = "AksesDitolakError";
  }
}

/** Pengguna yang sedang masuk, atau `null`. Peran selain "admin" diperlakukan sebagai "viewer" (hak paling kecil). */
export async function penggunaSaatIni(): Promise<PenggunaMasuk | null> {
  const sesi = await auth.api.getSession({ headers: await headers() });
  if (!sesi || sesi.user.banned) return null;
  return {
    id: sesi.user.id,
    nama: sesi.user.name,
    email: sesi.user.email,
    peran: sesi.user.role === "admin" ? "admin" : "viewer",
  };
}

/** Pengguna yang belum masuk diarahkan ke halaman masuk. */
export async function wajibMasuk(): Promise<PenggunaMasuk> {
  const pengguna = await penggunaSaatIni();
  if (!pengguna) redirect("/masuk");
  return pengguna;
}

/** Seperti `wajibMasuk`, lalu menolak pengguna yang bukan admin dengan `AksesDitolakError`. */
export async function wajibAdmin(): Promise<PenggunaMasuk> {
  const pengguna = await wajibMasuk();
  if (pengguna.peran !== "admin") throw new AksesDitolakError();
  return pengguna;
}

/**
 * Seperti `wajibMasuk`, lalu menolak dengan `AksesDitolakError` jika pengguna tidak ditugaskan di `idGudang`
 * dengan hak `tindakan`. Peran admin tidak dipertimbangkan: admin tanpa penugasan ditolak (PRD A3).
 */
export async function wajibHakTindakan(idGudang: number, tindakan: HakTindakan): Promise<PenggunaMasuk> {
  const pengguna = await wajibMasuk();
  if (!(await punyaHakTindakan(pengguna.id, idGudang, tindakan))) {
    throw new AksesDitolakError("Anda tidak punya hak tindakan ini di gudang tersebut.");
  }
  return pengguna;
}

/**
 * Seperti `wajibMasuk`, lalu mengembalikan gudang yang boleh dilihat di halaman Pengiriman Gudang.
 * Menolak dengan `AksesDitolakError` jika tidak ada (viewer tanpa penugasan). Akses lihat tidak memberi tindakan.
 */
export async function wajibAksesPengirimanGudang(): Promise<{ pengguna: PenggunaMasuk; daftarGudang: GudangDapatDilihat[] }> {
  const pengguna = await wajibMasuk();
  const daftarGudang = await daftarGudangDapatDilihat(pengguna);
  if (daftarGudang.length === 0) throw new AksesDitolakError("Anda belum ditugaskan di gudang mana pun.");
  return { pengguna, daftarGudang };
}

/**
 * Seperti `wajibMasuk`, lalu menolak dengan `AksesDitolakError` jika pengguna tidak boleh melihat Pengiriman Gudang
 * `idGudang`: tidak punya penugasan di gudang itu dan bukan admin (PRD A3). Tindakan tetap lewat `wajibHakTindakan`.
 */
export async function wajibAksesLihatGudang(
  idGudang: number,
): Promise<{ pengguna: PenggunaMasuk; gudang: GudangDapatDilihat }> {
  const pengguna = await wajibMasuk();
  const gudang = (await daftarGudangDapatDilihat(pengguna)).find((g) => g.id === idGudang);
  if (!gudang) throw new AksesDitolakError("Anda tidak punya akses ke gudang tersebut.");
  return { pengguna, gudang };
}

/**
 * Seperti `wajibMasuk`, lalu mengembalikan gudang tempat pengguna ditugaskan dengan hak `tindakan` (T98: halaman
 * Usulkan jadwal toko dan Salin jadwal). Menolak dengan `AksesDitolakError` jika tidak ada. Peran admin tidak
 * dipertimbangkan: admin tanpa penugasan ditolak (PRD A3).
 */
export async function wajibGudangDenganHak(tindakan: HakTindakan): Promise<GudangDapatDilihat[]> {
  const pengguna = await wajibMasuk();
  const daftarGudang = (await daftarGudangDapatDilihat(pengguna)).filter((g) => g.hakTindakan.includes(tindakan));
  if (daftarGudang.length === 0) throw new AksesDitolakError("Anda tidak punya hak tindakan ini di gudang mana pun.");
  return daftarGudang;
}
