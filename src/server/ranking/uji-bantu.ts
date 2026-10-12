import { randomInt, randomUUID } from "node:crypto";

import { eq, like, max } from "drizzle-orm";

import { db } from "@/server/db";
import { barisRanking, keluargaAroma, versiRanking } from "@/server/db/schema";
import { buatUrlUnggah } from "@/server/impor/penyimpanan";
import { buatWorkbookUji } from "@/server/impor/uji-bantu";

import { daftarkanRanking, kunciObjekRankingBaru } from "./ranking";

// Bantuan khusus test: workbook ranking kecil buatan sendiri (CODING_STANDARDS: data bisnis asli tidak di-commit).

type Sel = string | number | null;

const tahunDicadangkan = new Set<number>();

/**
 * Tahun ranking acak 3000–8999 yang belum dipakai `versi_ranking.bulan_ranking` di database test bersama dan belum
 * dikembalikan sebelumnya dalam proses test ini, agar nomor versi per bulan ranking tidak terpengaruh unggahan berkas
 * test lain (T96).
 */
export async function tahunRankingUjiBebas() {
  for (;;) {
    const tahun = randomInt(3000, 9000);
    if (tahunDicadangkan.has(tahun)) continue;
    const [dipakai] = await db
      .select({ id: versiRanking.id })
      .from(versiRanking)
      .where(like(versiRanking.bulanRanking, `${tahun}-%`))
      .limit(1);
    if (dipakai) continue;
    tahunDicadangkan.add(tahun);
    return tahun;
  }
}

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

/** Keluarga aroma uji dengan nama unik. */
export async function buatKeluargaUji() {
  const [keluarga] = await db
    .insert(keluargaAroma)
    .values({ nama: `UJI-${randomUUID()}` })
    .returning({ id: keluargaAroma.id, nama: keluargaAroma.nama });
  return keluarga;
}

/**
 * Menjadikan ranking berisi `keluarga` (urut RANK 1, 2, …) sebagai ranking berlaku, langsung di database (tanpa file):
 * ranking berlaku sebelumnya diarsipkan. Mengembalikan id versi baru.
 */
export async function publikasikanRankingUji({
  keluarga,
  idPengguna,
  bulanRanking = "2026-09",
}: {
  keluarga: readonly number[];
  idPengguna: string;
  bulanRanking?: string;
}) {
  return db.transaction(async (tx) => {
    await tx
      .update(versiRanking)
      .set({ status: "diarsipkan", diarsipkanPada: new Date() })
      .where(eq(versiRanking.status, "dipublikasikan"));
    const [{ terakhir }] = await tx
      .select({ terakhir: max(versiRanking.versi) })
      .from(versiRanking)
      .where(eq(versiRanking.bulanRanking, bulanRanking));
    const [versi] = await tx
      .insert(versiRanking)
      .values({
        bulanRanking,
        versi: (terakhir ?? 0) + 1,
        namaFile: "RANKING-UJI.xlsx",
        ukuranByte: 1,
        kunciObjek: kunciObjekRankingBaru(),
        status: "dipublikasikan",
        diunggahOleh: idPengguna,
        dipublikasikanOleh: idPengguna,
        dipublikasikanPada: new Date(),
      })
      .returning({ id: versiRanking.id, versi: versiRanking.versi });
    if (keluarga.length > 0) {
      await tx.insert(barisRanking).values(
        keluarga.map((keluargaAromaId, i) => ({ versiId: versi.id, rank: i + 1, variant: `UJI-${randomUUID()}`, qtySales: 0, keluargaAromaId })),
      );
    }
    return versi.id;
  });
}
