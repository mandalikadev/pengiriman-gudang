import { buatBerkasEkspor, namaBerkasEkspor } from "@/app/ringkasan/ekspor/berkas";
import { penggunaSaatIni } from "@/server/auth/kewenangan";
import { muatSemuaBarisRingkasan } from "@/server/laporan/ringkasan";

// Ekspor Ringkasan (T38, PRD A2). Semua pengguna yang sudah masuk (admin, operator, viewer) boleh mengekspor
// (▶ Keputusan 2026-10-09, perencanaan M2–M3). Sesi diperiksa di server sebelum data dibaca.

function tolak(status: number, pesan: string) {
  return Response.json({ pesan }, { status });
}

/** `GET /ringkasan/ekspor?bulan=…&toko=…&kategoriProduk=…&produk=…`: parameter sama dengan halaman Ringkasan. */
export async function GET(request: Request) {
  if ((await penggunaSaatIni()) === null) return tolak(401, "Anda belum masuk atau sesi sudah berakhir. Masuk lagi lalu ulangi ekspor.");

  const parameter = new URL(request.url).searchParams;
  const hasil = await muatSemuaBarisRingkasan({
    bulanPilihan: parameter.getAll("bulan"),
    filter: {
      toko: parameter.getAll("toko"),
      kategoriProduk: parameter.getAll("kategoriProduk"),
      produk: parameter.getAll("produk"),
    },
  });
  if (hasil.keadaan === "belum-ada-cache") {
    return tolak(409, "Hasil hitung laporan belum tersedia. Muat ulang halaman beberapa saat lagi lalu ulangi ekspor.");
  }
  if (hasil.keadaan === "belum-dipilih") return tolak(400, "Belum ada periode yang diterapkan. Pilih bulan lalu tekan Terapkan.");
  if (hasil.keadaan === "pilihan-tidak-valid") return tolak(400, hasil.pesan);

  return new Response(new Uint8Array(buatBerkasEkspor(hasil)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaBerkasEkspor(hasil.bulanPilihan)}"`,
      "Cache-Control": "no-store",
    },
  });
}
