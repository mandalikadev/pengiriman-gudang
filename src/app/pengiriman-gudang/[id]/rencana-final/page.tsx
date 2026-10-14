import { redirect } from "next/navigation";

import { urlRiwayat } from "@/app/riwayat/alamat";

const ID_VALID = /^\d{1,9}$/;

/**
 * Alamat lama riwayat rencana final satu gudang (T63). Riwayat pindah ke halaman Riwayat (T127; PRD A7 ▶ Keputusan
 * 2026-10-14): alamat ini dialihkan ke `/riwayat` dengan filter gudang itu. Kewenangan diperiksa halaman tujuan.
 */
export default async function AlihkanRiwayatRencanaFinal({ params }: { params: Promise<{ id: string }> }): Promise<never> {
  const { id } = await params;
  redirect(ID_VALID.test(id) ? urlRiwayat(Number(id)) : urlRiwayat());
}
