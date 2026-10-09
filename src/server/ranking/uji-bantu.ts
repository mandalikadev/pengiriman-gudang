import { buatUrlUnggah } from "@/server/impor/penyimpanan";
import { buatWorkbookUji } from "@/server/impor/uji-bantu";

import { daftarkanRanking, kunciObjekRankingBaru } from "./ranking";

// Bantuan khusus test: workbook ranking kecil buatan sendiri (CODING_STANDARDS: data bisnis asli tidak di-commit).

type Sel = string | number | null;

/** Workbook dengan sheet RANKING SALES; `baris` = [RANK, VARIANT, QTY SALES] setelah header. */
export function workbookRankingUji(baris: Sel[][]) {
  return buatWorkbookUji({ "RANKING SALES": [["RANK", "VARIANT", "QTY SALES"], ...baris] });
}

/** Unggah lewat presigned URL dan daftarkan ranking langsung di lapisan server (tanpa server action). */
export async function rankingUji({ isi, idPengguna, bulanRanking = "2026-09" }: { isi: Uint8Array; idPengguna: string; bulanRanking?: string }) {
  const kunci = kunciObjekRankingBaru();
  const jawaban = await fetch(await buatUrlUnggah(kunci), { method: "PUT", body: Buffer.from(isi) });
  if (!jawaban.ok) throw new Error(`Unggah uji gagal: ${jawaban.status}`);
  const hasil = await daftarkanRanking({ kunci, namaFile: "RANKING-UJI.xlsx", bulanRanking, idPengguna });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  return hasil.idVersi;
}
