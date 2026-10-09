import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";

// Bantuan khusus test.

const NAMA_SHEET = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

/**
 * Membuat bulan laporan yang tersedia di data: satu impor aktif kecil untuk setiap `bulan` (1–12) di tahun uji acak,
 * lalu menghitung ulang cache laporan. Mengembalikan kode bulan `YYYY-MM` sesuai urutan `bulan`.
 */
export async function siapkanBulanTersediaUji(idAdmin: string, bulan: readonly number[]): Promise<string[]> {
  await pastikanBucket();
  const tahun = tahunUji();
  const toko = await buatTokoUji();
  for (const b of bulan) {
    const namaSheet = `${NAMA_SHEET[b - 1]} (S)`;
    const isi = buatWorkbookUji({
      [namaSheet]: sheetPenjualanUji({
        toko: toko.nama,
        bulan: b,
        hari: [1, 2, 3, 4, 5, 6, 7],
        produk: [
          {
            kode: kodeProdukUji(),
            nama: "15ML GLITTER - GORGEOUS",
            ukuran: "15ML",
            kategori: "15ML GLITTER/LEATHER",
            kuantitas: [1, 0, 2, 1, 0, 3, 1],
          },
        ],
      }),
    });
    const idImpor = await imporUji({ isi, namaSheet, tahunImpor: tahun, bulanImpor: b, idPengguna: idAdmin });
    const hasil = await aktifkanImpor(idImpor, idAdmin);
    if (hasil.keadaan !== "berhasil") throw new Error(`Aktivasi impor uji gagal: ${JSON.stringify(hasil)}`);
  }
  await hitungUlangCacheLaporan();
  return bulan.map((b) => `${tahun}-${String(b).padStart(2, "0")}`);
}
