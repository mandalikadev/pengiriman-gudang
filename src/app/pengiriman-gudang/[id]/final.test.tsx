import { readFileSync } from "node:fs";
import { join } from "node:path";

import { asc, eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, perubahanKategori, produk, rencanaFinal } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { buatPerubahanKategori } from "@/server/kalender/perubahan-kategori";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", dimuatUlang: [] as string[] }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    kepala.dimuatUlang.push(path);
  },
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { finalisasiRencana } from "./aksi-final";
import HalamanPengirimanGudang from "./page";
import HalamanRencanaFinal from "./rencana-final/[idRencana]/page";

// T62: finalisasi rencana per toko per tanggal kirim. Hak `finalisasi` diperiksa di server (admin tanpa penugasan
// ditolak). Halaman draft menampilkan form finalisasi per toko yang siap, alasan bila belum bisa, dan status Final
// beserta versinya (DESIGN §7). Toko yang sudah final bisa difinalisasi ulang dengan alasan wajib; toko tanpa varian
// tampil sebagai masalah; perlu dihitung ulang hanya menahan toko yang terdampak (PRD A7 ▶ Keputusan 2026-10-11, T62).
// Layar berhasil memakai zona suasana (DESIGN §1), menandai versi baru, dan menjelaskan bahwa finalisasi bukan
// konfirmasi pengiriman fisik (PRD A7).

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string };
  kasusJumlahKirim: { stokAkhir: number }[];
};
const TANGGAL_KIRIM = parseTanggalBisnis(golden.kasusCakupan.tanggalKirim);
const SEMUA_HARI_JUNI = Array.from({ length: 30 }, (_, i) => i + 1);
const kategoriHari = (nama: NamaHari): KategoriDasar =>
  nama === "Jumat" || nama === "Sabtu" || nama === "Minggu" ? nama : "Senin–Kamis";
const produkUji = (kode: string, kuantitas: number[]) => ({
  kode,
  nama: "15ML GLITTER - GORGEOUS",
  ukuran: "15ML",
  kategori: "15ML GLITTER/LEATHER",
  kuantitas,
});

let jabodetabek: number;
/** Toko yang semua baris otomatisnya tanpa masalah (stok sudah diisi). */
let tokoSiap: { id: number; nama: string };
/** Toko dengan satu baris tertahan (stok belum diisi). */
let tokoTertahan: { id: number; nama: string };
/** Toko yang mengirim tanpa varian di periode sumber. */
let tokoTanpaVarian: { id: number; nama: string };
let idAdmin: string;
const ALASAN_UJI = "Uji T62 halaman";
const kode = { siap: kodeProdukUji("GOR"), tertahan: kodeProdukUji("GOR") };

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  jabodetabek = await idGudangUji("Gudang Jabodetabek");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
  [tokoSiap, tokoTertahan, tokoTanpaVarian] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
  const semuaToko = [tokoSiap, tokoTertahan, tokoTanpaVarian];
  await db.insert(hubunganTokoGudang).values(semuaToko.map((t) => ({ tokoId: t.id, gudangId: jabodetabek })));
  await db.insert(jadwalToko).values(
    semuaToko.map((t) => ({
      tokoId: t.id,
      pola: "mingguan" as const,
      hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }],
      dibuatOleh: idAdmin,
    })),
  );
  // Satu impor aktif per bulan impor (ADR-0002): setiap toko memakai tahun uji sendiri.
  const [tahunSiap, tahunTertahan] = [tahunUji(), tahunUji()];
  const sesuaiContoh = kuantitasJuniMenurutHari(tahunSiap, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({ idAdmin, tahun: tahunSiap, namaToko: tokoSiap.nama, hari: SEMUA_HARI_JUNI, produk: [produkUji(kode.siap, sesuaiContoh)] });
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunTertahan,
    namaToko: tokoTertahan.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.tertahan, SEMUA_HARI_JUNI.map(() => 1))],
  });
  await hitungUlangCacheLaporan();
  const periode = await tetapkanPeriodeSumber({
    idGudang: jabodetabek,
    bulan: [`${tahunSiap}-06`, `${tahunTertahan}-06`].sort(),
    idPengguna: idAdmin,
  });
  if (periode.keadaan !== "berhasil") throw new Error(periode.pesan);
  const keluarga = await buatKeluargaUji();
  await publikasikanRankingUji({ keluarga: [keluarga.id], idPengguna: idAdmin });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: keluarga.id })
    .where(inArray(produk.kode, [kode.siap, kode.tertahan]));

  const hasil = await hitungDraftRencana({ idGudang: jabodetabek, tanggalKirim: TANGGAL_KIRIM, idPengguna: idAdmin });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  const stok = await simpanStokToko({
    idGudang: jabodetabek,
    tanggalKirim: TANGGAL_KIRIM,
    tokoId: tokoSiap.id,
    stok: [{ kodeProduk: kode.siap, stokAkhir: golden.kasusJumlahKirim[0].stokAkhir }],
  });
  if (stok.keadaan !== "berhasil") throw new Error(stok.pesan);
}, 120_000);

afterAll(async () => {
  // Draft merujuk periode sumber; berkas test lain menghapus periode sumber gudang.
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
  // Toko uji tidak lagi terhubung, agar tidak ikut draft gudang ini di berkas test lain.
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, [tokoSiap.id, tokoTertahan.id, tokoTanpaVarian.id]));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, jabodetabek));
  await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, ALASAN_UJI));
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.dimuatUlang = [];
});

async function masukOperator(idGudang: number, hakTindakan: HakTindakan[]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
  return operator;
}

const masukAdmin = async () => (kepala.cookie = (await kepalaPenggunaUji("admin")).cookie);

/** Isian server action seperti yang dikirim form finalisasi untuk `tokoId`. */
async function isian(tokoId: number, alasanFinalisasiUlang?: string) {
  const versi = (await bacaDraftRencana(jabodetabek, TANGGAL_KIRIM))?.toko.find((t) => t.id === tokoId)?.versi;
  return { idGudang: jabodetabek, tanggalKirim: TANGGAL_KIRIM, tokoId, versi, alasanFinalisasiUlang };
}

const rencanaGudang = () =>
  db
    .select({ id: rencanaFinal.id, tokoId: rencanaFinal.tokoId, versi: rencanaFinal.versi })
    .from(rencanaFinal)
    .where(eq(rencanaFinal.gudangId, jabodetabek))
    .orderBy(asc(rencanaFinal.id));

/** Draft tanggal contoh; `tokoId` = toko yang dibuka (T73). */
const bukaDraft = async (tokoId?: number) =>
  renderToStaticMarkup(
    await HalamanPengirimanGudang({
      params: Promise.resolve({ id: String(jabodetabek) }),
      searchParams: Promise.resolve({ tanggal: TANGGAL_KIRIM, ...(tokoId === undefined ? {} : { toko: String(tokoId) }) }),
    }),
  );

/** Baris ringkasan satu toko di draft (T73). */
const ringkasanToko = (html: string, tokoId: number) => new RegExp(`<tr[^>]*data-ringkasan-toko="${tokoId}".*?</tr>`).exec(html)?.[0] ?? "";

const bukaFinal = async (idRencana: number | string, idGudang: number | string = jabodetabek) =>
  renderToStaticMarkup(await HalamanRencanaFinal({ params: Promise.resolve({ id: String(idGudang), idRencana: String(idRencana) }) }));

/** Bagian satu toko di draft. */
const bagianToko = (html: string, tokoId: number) => new RegExp(`<section[^>]*data-draft-toko="${tokoId}".*?</section>`).exec(html)?.[0] ?? "";

describe("kewenangan finalisasi (diperiksa di server)", () => {
  it("operator tanpa hak finalisasi, admin tanpa penugasan, dan hak finalisasi di gudang lain ditolak tanpa membuat rencana final", async () => {
    await masukOperator(
      jabodetabek,
      daftarHakTindakan.filter((h) => h !== "finalisasi"),
    );
    await expect(finalisasiRencana(await isian(tokoSiap.id))).rejects.toBeInstanceOf(AksesDitolakError);

    await masukAdmin();
    await expect(finalisasiRencana(await isian(tokoSiap.id))).rejects.toBeInstanceOf(AksesDitolakError);

    await masukOperator(await idGudangUji("Gudang Bali"), ["finalisasi"]);
    await expect(finalisasiRencana(await isian(tokoSiap.id))).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await rencanaGudang()).toEqual([]);
    expect(kepala.dimuatUlang).toEqual([]);
  });

  it("isian yang tidak valid ditolak dengan pesan", async () => {
    await masukOperator(jabodetabek, ["finalisasi"]);
    await expect(finalisasiRencana({ ...(await isian(tokoSiap.id)), tanggalKirim: "2026-02-30" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Tanggal kirim tidak valid.",
    });
    expect(await rencanaGudang()).toEqual([]);
  });
});

describe("finalisasi di halaman Pengiriman Gudang", () => {
  it("operator berhak melihat form finalisasi untuk toko yang siap, dan alasan untuk toko yang tertahan; tanpa hak tidak ada form", async () => {
    await masukOperator(jabodetabek, ["finalisasi"]);
    const html = await bukaDraft(tokoSiap.id);
    const siap = bagianToko(html, tokoSiap.id);
    expect(siap).toMatch(/data-finalisasi-toko.*?<button[^>]*type="submit"[^>]*>Finalisasi rencana/);
    expect(siap).toContain("Finalisasi menyimpan rencana kebutuhan barang toko ini beserta dasar perhitungannya.");
    expect(siap).toContain("Ini bukan konfirmasi pengiriman fisik atau penerimaan barang.");
    // Form finalisasi hanya untuk toko yang dibuka (T73).
    expect([...html.matchAll(/data-finalisasi-toko="(\d+)"/g)].map((m) => m[1])).toEqual([String(tokoSiap.id)]);
    expect(bagianToko(html, tokoTertahan.id)).toBe("");
    const tertahan = bagianToko(await bukaDraft(tokoTertahan.id), tokoTertahan.id);
    expect(tertahan).not.toContain("data-finalisasi-toko");
    expect(tertahan).toMatch(/data-finalisasi-tertahan[^>]*>.*?lucide-triangle-alert.*?Belum bisa difinalisasi: 1 baris masih tertahan\./);
    // Toko tanpa varian tampil sebagai masalah dan tidak bisa difinalisasi (PRD A7 ▶ Keputusan 2026-10-11, T62).
    const tanpaVarian = bagianToko(await bukaDraft(tokoTanpaVarian.id), tokoTanpaVarian.id);
    expect(tanpaVarian).toMatch(/data-tanpa-varian[^>]*>.*?lucide-triangle-alert.*?Tidak ada varian dari periode sumber untuk toko ini</);
    expect(tanpaVarian).not.toContain("data-jumlah-tertahan");
    expect(tanpaVarian).not.toContain("data-finalisasi-toko");
    expect(tanpaVarian).toMatch(
      /data-finalisasi-tertahan[^>]*>.*?lucide-triangle-alert.*?Belum bisa difinalisasi: tidak ada varian dari periode sumber untuk toko ini\./,
    );

    await masukOperator(jabodetabek, ["input-stok"]);
    const tanpaHak = await bukaDraft(tokoSiap.id);
    expect(tanpaHak).not.toContain("data-finalisasi-toko");
    expect(tanpaHak).not.toContain("data-finalisasi-tertahan");
  });

  it("perlu dihitung ulang hanya menahan toko yang terdampak: toko lain tetap menampilkan form finalisasi", async () => {
    expect(
      await buatPerubahanKategori({
        tanggal: parseTanggalBisnis("2026-06-10"),
        idToko: tokoTertahan.id,
        kategoriBaru: "Minggu",
        alasan: ALASAN_UJI,
        idPengguna: idAdmin,
      }),
    ).toEqual({ keadaan: "berhasil" });
    try {
      await masukOperator(jabodetabek, ["finalisasi"]);
      const html = await bukaDraft();
      expect(html).toMatch(/data-perlu-dihitung-ulang.*?Toko yang terkena perubahan ini tidak bisa difinalisasi sebelum draft dihitung ulang\./);
      // Ringkasan (T73): hanya toko yang terdampak ditandai perlu dihitung ulang.
      expect(ringkasanToko(html, tokoTertahan.id)).toContain('data-status="perluDihitungUlang"');
      expect(ringkasanToko(html, tokoSiap.id)).not.toContain('data-status="perluDihitungUlang"');
      expect(bagianToko(await bukaDraft(tokoSiap.id), tokoSiap.id)).toContain("data-finalisasi-toko");
      expect(bagianToko(await bukaDraft(tokoTertahan.id), tokoTertahan.id)).toMatch(
        /data-finalisasi-tertahan[^>]*>.*?lucide-triangle-alert.*?Belum bisa difinalisasi: dasar perhitungan toko ini berubah \(Kategori efektif\)\. Hitung ulang draft lebih dulu\./,
      );
    } finally {
      await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, ALASAN_UJI));
    }
  });

  it("operator berhak memfinalisasi toko yang siap; toko itu tampil Final versi 1 dengan form finalisasi ulang; toko tertahan ditolak", async () => {
    await masukOperator(jabodetabek, ["finalisasi"]);
    await expect(finalisasiRencana(await isian(tokoTertahan.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Rencana toko ini belum bisa difinalisasi karena 1 baris masih tertahan. Selesaikan masalahnya lebih dulu.",
    });
    await expect(finalisasiRencana(await isian(tokoTanpaVarian.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Rencana toko ini tidak bisa difinalisasi karena tidak ada varian dari periode sumber untuk toko ini.",
    });

    const hasil = await finalisasiRencana(await isian(tokoSiap.id));
    const [rencana] = await rencanaGudang();
    expect(hasil).toEqual({ keadaan: "berhasil", idRencana: rencana.id });
    expect(rencana).toMatchObject({ tokoId: tokoSiap.id, versi: 1 });
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${jabodetabek}`]);

    await masukOperator(jabodetabek, ["finalisasi"]);
    // Ringkasan tanpa toko dibuka (T73): status Final beserta versinya.
    expect(ringkasanToko(await bukaDraft(), tokoSiap.id)).toMatch(/data-status="final".*?lucide-circle-check.*?Final.*?data-versi-final="1"[^>]*>Versi 1</);
    expect(ringkasanToko(await bukaDraft(), tokoTertahan.id)).not.toContain('data-status="final"');
    const siap = bagianToko(await bukaDraft(tokoSiap.id), tokoSiap.id);
    expect(siap).toMatch(/data-status="final".*?lucide-circle-check.*?Final.*?data-versi-final="1"[^>]*>Versi 1</);
    expect(siap).toMatch(/data-finalisasi-toko[^>]*data-finalisasi-ulang/);
    expect(siap).toContain("Rencana toko ini sudah final (versi 1). Finalisasi ulang menyimpan versi 2 yang menggantikan versi 1; versi 1 tetap tersimpan.");
    expect(siap).toMatch(/<label[^>]*>Alasan finalisasi ulang<input(?=[^>]*\brequired="")(?=[^>]*\bname="alasan")/);
    expect(siap).toMatch(/<button[^>]*type="submit"[^>]*>Finalisasi ulang/);

    // Tanpa hak finalisasi: badge Final dan versi tampil, tanpa form.
    await masukAdmin();
    const lihat = bagianToko(await bukaDraft(tokoSiap.id), tokoSiap.id);
    expect(lihat).toMatch(/data-status="final".*?Final.*?Versi 1/);
    expect(lihat).not.toContain("data-finalisasi-toko");
  });

  it("finalisasi ulang: alasan wajib di server; dengan alasan menghasilkan versi 2", async () => {
    await masukOperator(jabodetabek, ["finalisasi"]);
    for (const alasan of [undefined, "", "   "]) {
      await expect(finalisasiRencana(await isian(tokoSiap.id, alasan))).resolves.toEqual({
        keadaan: "gagal",
        pesan: "Alasan finalisasi ulang wajib diisi.",
      });
    }
    expect(await rencanaGudang()).toHaveLength(1);

    const hasil = await finalisasiRencana(await isian(tokoSiap.id, "Stok salah ketik"));
    const [versi1, versi2] = await rencanaGudang();
    expect(hasil).toEqual({ keadaan: "berhasil", idRencana: versi2.id });
    expect([versi1.versi, versi2.versi]).toEqual([1, 2]);
    expect(bagianToko(await bukaDraft(tokoSiap.id), tokoSiap.id)).toMatch(/data-versi-final="2"[^>]*>Versi 2</);
  });

  it("layar berhasil versi baru: ditandai menggantikan versi sebelumnya beserta alasannya", async () => {
    const [versi1, versi2] = await rencanaGudang();
    await masukOperator(jabodetabek, ["finalisasi"]);
    const html = await bukaFinal(versi2.id);
    expect(html).toMatch(/data-versi-menggantikan[^>]*>Versi 2 menggantikan versi 1\.</);
    expect(html).toMatch(/Alasan finalisasi ulang<\/dt><dd[^>]*>Stok salah ketik</);
    const lama = await bukaFinal(versi1.id);
    expect(lama).not.toContain("data-versi-menggantikan");
    expect(lama).not.toContain("Alasan finalisasi ulang");
    expect(lama).toMatch(/Versi<\/dt><dd[^>]*>1</);
  });

  it("layar berhasil: zona suasana, status Final, dan penjelasan bahwa finalisasi bukan konfirmasi pengiriman fisik", async () => {
    const [rencana] = await rencanaGudang();
    for (const masuk of [() => masukOperator(jabodetabek, ["finalisasi"]), masukAdmin]) {
      await masuk();
      const html = await bukaFinal(rencana.id);
      expect(html).toContain("blur-3xl");
      // DESIGN §6: ikon 28 px di zona suasana.
      expect(html).toMatch(/<svg[^>]*lucide-circle-check[^>]*size-7/);
      expect(html).toMatch(/<h1[^>]*class="[^"]*text-4xl[^"]*md:text-5xl[^"]*"[^>]*>Rencana final tersimpan<\/h1>/);
      expect(html).toMatch(/data-status="final".*?lucide-circle-check.*?Final/);
      expect(html).toContain(`Toko ${tokoSiap.nama}`);
      expect(html).toContain("Senin, 08-06-2026");
      expect(html).toContain("Finalisasi hanya menyatakan rencana kebutuhan barang telah disimpan.");
      expect(html).toContain("Ini bukan konfirmasi pengiriman fisik atau penerimaan barang.");
      expect(html).toContain(`href="/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}"`);
    }
  });

  it("layar rencana final: tanpa akses gudang, gudang lain, atau id tidak dikenal → 404", async () => {
    const [rencana] = await rencanaGudang();
    const ditolak = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ digest: expect.stringContaining("404") });

    await masukOperator(await idGudangUji("Gudang Bali"), ["finalisasi"]);
    await ditolak(bukaFinal(rencana.id));

    await masukAdmin();
    await ditolak(bukaFinal(rencana.id, await idGudangUji("Gudang Bali")));
    await ditolak(bukaFinal("bukan-angka"));
    await ditolak(bukaFinal(999_999_999));
  });
});
