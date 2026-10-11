import { labelStatus } from "@/components/badge-status";
import type { RencanaFinal } from "@/server/gudang/rencana-final";

/**
 * Label status baris rencana final, dipakai bersama layar rincian dan berkas ekspor supaya istilahnya sama (T77).
 * `siap` = produk otomatis tanpa masalah (tampil "Otomatis"), `manual` = produk manual (label badge status Manual).
 */
export const labelStatusBarisRencanaFinal: Record<RencanaFinal["baris"][number]["status"], string> = {
  siap: "Otomatis",
  manual: labelStatus("manual"),
};
