import { redirect } from "next/navigation";

import { urlRincianRencanaFinal } from "@/app/riwayat/alamat";

/**
 * Alamat lama rincian rencana final (T63). Rincian pindah ke halaman Riwayat (T127; PRD A7 ▶ Keputusan 2026-10-14):
 * alamat ini dialihkan ke `/riwayat/rencana-final/<idRencana>`, dengan panel rincian baris (`?rincian=`) tetap terbuka.
 * Kewenangan dan id diperiksa halaman tujuan.
 */
export default async function AlihkanRincianRencanaFinal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; idRencana: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const { idRencana } = await params;
  const rincian = (await searchParams)?.rincian;
  redirect(urlRincianRencanaFinal(encodeURIComponent(idRencana), typeof rincian === "string" ? rincian : undefined));
}
