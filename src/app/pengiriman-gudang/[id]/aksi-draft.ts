"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibHakTindakan } from "@/server/auth/kewenangan";
import { hitungDraftRencana } from "@/server/gudang/draft-rencana";

// Draft rencana (T58, PRD A6 ▶ Keputusan perencanaan M2–M3). Hak `hitung-kebutuhan` di gudang itu diperiksa di server
// sebelum membaca atau menulis data; admin tanpa penugasan berhak ditolak (hanya melihat).

const skemaGudang = z.object({ idGudang: z.number().int() });

const skemaHitung = skemaGudang.extend({
  tanggalKirim: z.string({ error: "Pilih tanggal kirim." }).min(1, "Pilih tanggal kirim."),
});

function bacaTanggal(teks: string): TanggalBisnis | null {
  try {
    return parseTanggalBisnis(teks);
  } catch {
    return null;
  }
}

/** Membuat (atau mengganti) draft rencana gudang untuk tanggal kirim pilihan dan menyimpannya. */
export async function hitungDraft(input: unknown): Promise<HasilSimpan> {
  const gudang = skemaGudang.safeParse(input);
  // Id gudang tidak terbaca → tidak ada gudang yang cocok, jadi pemeriksaan hak tetap menolak.
  const operator = await wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "hitung-kebutuhan");
  const isian = skemaHitung.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const tanggalKirim = bacaTanggal(isian.data.tanggalKirim);
  if (tanggalKirim === null) return { keadaan: "gagal", pesan: "Tanggal kirim tidak valid." };

  const { idGudang } = isian.data;
  const hasil = await hitungDraftRencana({ idGudang, tanggalKirim, idPengguna: operator.id });
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(`/pengiriman-gudang/${idGudang}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}
