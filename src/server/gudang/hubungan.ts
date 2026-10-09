import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, toko } from "@/server/db/schema";

export type StatusTambahToko = "berhasil" | "sudahTerhubung" | "nonaktif" | "terkaitGudangLain";

export type HasilTambahToko = { idToko: number; namaToko: string; status: StatusTambahToko; keterangan: string };

export type HasilHubungkan =
  | { keadaan: "berhasil"; hasil: HasilTambahToko[] }
  | { keadaan: "gagal"; pesan: "Gudang tidak ditemukan." | "Ada toko yang tidak ditemukan. Muat ulang halaman, lalu pilih lagi." };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function gudangSaatIni(tx: Tx, idToko: number[]) {
  if (idToko.length === 0) return new Map<number, { id: number; nama: string }>();
  const baris = await tx
    .select({ idToko: hubunganTokoGudang.tokoId, id: gudang.id, nama: gudang.nama })
    .from(hubunganTokoGudang)
    .innerJoin(gudang, eq(gudang.id, hubunganTokoGudang.gudangId))
    .where(inArray(hubunganTokoGudang.tokoId, idToko));
  return new Map(baris.map((b) => [b.idToko, { id: b.id, nama: b.nama }]));
}

/**
 * Menghubungkan beberapa toko ke satu gudang dan mengembalikan hasil per toko, sesuai urutan `idToko`.
 * ADR-0009: toko yang sudah terkait gudang lain ditolak; primary key `hubungan_toko_gudang.toko_id`
 * menjadi penegak terakhir bila dua admin menghubungkan toko yang sama bersamaan.
 * Toko nonaktif tidak dihubungkan (PRD A3).
 */
export async function hubungkanTokoKeGudang(idGudang: number, idToko: readonly number[]): Promise<HasilHubungkan> {
  const idUnik = [...new Set(idToko)];
  return db.transaction(async (tx) => {
    const [tujuan] = await tx.select().from(gudang).where(eq(gudang.id, idGudang));
    if (!tujuan) return { keadaan: "gagal", pesan: "Gudang tidak ditemukan." };

    const dataToko = await tx.select().from(toko).where(inArray(toko.id, idUnik));
    if (dataToko.length !== idUnik.length) {
      return { keadaan: "gagal", pesan: "Ada toko yang tidak ditemukan. Muat ulang halaman, lalu pilih lagi." };
    }
    const tokoPerId = new Map(dataToko.map((t) => [t.id, t]));

    const sebelum = await gudangSaatIni(tx, idUnik);
    const calon = idUnik.filter((id) => !sebelum.has(id) && tokoPerId.get(id)?.aktif);
    const ditambahkan = new Set<number>();
    if (calon.length > 0) {
      const baris = await tx
        .insert(hubunganTokoGudang)
        .values(calon.map((id) => ({ tokoId: id, gudangId: tujuan.id })))
        .onConflictDoNothing({ target: hubunganTokoGudang.tokoId })
        .returning({ idToko: hubunganTokoGudang.tokoId });
      for (const b of baris) ditambahkan.add(b.idToko);
    }
    // Calon yang tidak tersisip baru saja dihubungkan transaksi lain: baca ulang gudangnya.
    const sesudah = await gudangSaatIni(
      tx,
      calon.filter((id) => !ditambahkan.has(id)),
    );

    const hasil = idUnik.map((id): HasilTambahToko => {
      const { nama: namaToko, aktif } = tokoPerId.get(id)!;
      if (ditambahkan.has(id)) {
        return { idToko: id, namaToko, status: "berhasil", keterangan: `Ditambahkan ke ${tujuan.nama}.` };
      }
      const terkait = sebelum.get(id) ?? sesudah.get(id);
      if (terkait?.id === tujuan.id) {
        return {
          idToko: id,
          namaToko,
          status: "sudahTerhubung",
          keterangan: `Sudah terhubung ke ${tujuan.nama} sebelumnya; tidak ada yang diubah.`,
        };
      }
      if (terkait) {
        return {
          idToko: id,
          namaToko,
          status: "terkaitGudangLain",
          keterangan: `Tidak ditambahkan: sudah terhubung ke ${terkait.nama}. Satu toko hanya boleh terhubung ke satu gudang.`,
        };
      }
      if (!aktif) {
        return { idToko: id, namaToko, status: "nonaktif", keterangan: "Tidak ditambahkan: toko berstatus nonaktif." };
      }
      // Tidak terjadi: calon aktif tanpa hubungan selalu tersisip atau terbaca ulang di atas.
      throw new Error(`Hasil hubungan toko ${id} tidak diketahui.`);
    });
    return { keadaan: "berhasil", hasil };
  });
}
