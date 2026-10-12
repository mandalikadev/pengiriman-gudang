import { eq, inArray } from "drizzle-orm";

import type { KategoriDasar, NamaHari } from "@/domain/kalender";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, produk, rencanaFinal } from "@/server/db/schema";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

import { tetapkanPeriodeSumber } from "./periode-sumber";
import { buatTokoUji } from "./uji-bantu";

// Bantuan khusus test T91: contoh PRD A6 ▶ Revisi 2026-10-12 (UAT ketiga). SMB 2× seminggu Senin (H) dan Kamis (H−1);
// rata-rata PW110P-GOR Senin–Kamis 5, Jumat 5, Sabtu 8, Minggu 7.

const RATA_RATA_SMB: Record<KategoriDasar, number> = { "Senin–Kamis": 5, Jumat: 5, Sabtu: 8, Minggu: 7 };
const SEMUA_HARI_JUNI = Array.from({ length: 30 }, (_, i) => i + 1);
const kategoriHari = (nama: NamaHari): KategoriDasar =>
  nama === "Jumat" || nama === "Sabtu" || nama === "Minggu" ? nama : "Senin–Kamis";

/**
 * Toko uji di gudang `idGudang` dengan jadwal aktif seperti SMB dan satu produk otomatis (keluarga tujuh besar ranking
 * berlaku) yang penjualan Juni-nya menghasilkan rata-rata contoh. Periode sumber gudang ditetapkan ke bulan itu saja.
 */
export async function siapkanTokoSmbUji({ idGudang, idAdmin }: { idGudang: number; idAdmin: string }) {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, idGudang));
  const toko = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: toko.id, gudangId: idGudang });
  await db.insert(jadwalToko).values({
    tokoId: toko.id,
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapanHari: 0 },
      { hari: "Kamis", persiapanHari: 1 },
    ],
    dibuatOleh: idAdmin,
  });

  const tahun = tahunUji();
  const kodeProduk = kodeProdukUji("GOR");
  await aktifkanImporJuniUji({
    idAdmin,
    tahun,
    namaToko: toko.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [
      {
        kode: kodeProduk,
        nama: "PW110P - GORGEOUS",
        ukuran: "110ML",
        kategori: "PARFUM WANITA",
        kuantitas: kuantitasJuniMenurutHari(tahun, SEMUA_HARI_JUNI, (nama) => RATA_RATA_SMB[kategoriHari(nama)]),
      },
    ],
  });
  await hitungUlangCacheLaporan();
  const hasil = await tetapkanPeriodeSumber({ idGudang, bulan: [`${tahun}-06`], idPengguna: idAdmin });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);

  const keluarga = await buatKeluargaUji();
  await publikasikanRankingUji({ keluarga: [keluarga.id], idPengguna: idAdmin });
  await db.update(produk).set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: keluarga.id }).where(eq(produk.kode, kodeProduk));
  return { toko, kodeProduk };
}

/** Membersihkan draft dan rencana final gudang, serta melepas toko uji dari gudang agar tidak ikut berkas test lain. */
export async function bersihkanTokoSmbUji({ idGudang, idToko }: { idGudang: number; idToko: number }) {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, idGudang));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, idGudang));
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, [idToko]));
}
