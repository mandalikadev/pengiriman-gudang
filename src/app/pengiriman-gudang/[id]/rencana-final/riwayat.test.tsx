import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { formatWaktu } from "@/app/admin/impor/format";
import { parseTanggalBisnis, type KategoriDasar, type NamaHari, type TanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, impor, jadwalToko, perubahanKategori, produk, rencanaFinal, toko, user } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { finalisasiRencanaToko } from "@/server/gudang/rencana-final";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { kodeProdukUji, tahunUjiBebas } from "@/server/impor/uji-bantu";
import { buatPerubahanKategori } from "@/server/kalender/perubahan-kategori";
import { terapkanPemetaan } from "@/server/keluarga-aroma/pemetaan";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanPengirimanGudang from "../page";
import HalamanRencanaFinal from "./[idRencana]/page";
import HalamanRincianRencanaFinal from "./[idRencana]/rincian/page";
import HalamanRiwayatRencanaFinal from "./page";

// T63: riwayat rencana final. Pengguna dengan akses lihat gudang membuka daftar rencana final (filter tanggal kirim dan
// toko; siapa dan kapan memfinalisasi) dan rinciannya, semuanya dibaca dari snapshot (PRD A7, B9). Versi lama tetap
// tampil; versi baru ditandai "Versi N menggantikan versi N−1" (PRD A7 ▶ Keputusan 2026-10-11, T62). Zona kerja
// (DESIGN §1), status ikon + teks (DESIGN §7). Contoh PRD A6 / golden `jumlah-kirim.json`: kebutuhan 56, stok 20, tujuh
// besar → jumlah kirim 44.

type Golden = {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; kebutuhan: number; tanggalCakupan: { tanggal: string; kategoriEfektif: KategoriDasar }[] };
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
};
const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../../tests/golden/jumlah-kirim.json"), "utf8")) as Golden;
const [CONTOH] = golden.kasusJumlahKirim;

const TANGGAL_1 = parseTanggalBisnis(golden.kasusCakupan.tanggalKirim);
/** Senin berikutnya: tanggal kirim kedua untuk filter. */
const TANGGAL_2 = parseTanggalBisnis("2026-06-15");
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
const ALASAN_UJI = "Uji T63";
const ALASAN_ULANG = "Stok salah ketik";

let cibubur: number;
let idAdmin: string;
let idOperator: string;
let tokoA: { id: number; nama: string };
let tokoB: { id: number; nama: string };
let tahunA: number;
let sesuaiContoh: number[];
let keluargaLain: number;
const kode = { contoh: kodeProdukUji("GOR"), manual: kodeProdukUji("GOR-T"), tokoB: kodeProdukUji("GOR") };
/** Id rencana final: toko A tanggal 1 versi 1 dan 2, toko B tanggal 1, toko A tanggal 2. */
const rencana = { a1v1: 0, a1v2: 0, b1: 0, a2: 0 };

async function stok(tanggalKirim: TanggalBisnis, tokoId: number, kodeProduk: string, stokAkhir: number) {
  const hasil = await simpanStokToko({ idGudang: cibubur, tanggalKirim, tokoId, stok: [{ kodeProduk, stokAkhir }] });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
}

async function finalisasi(tanggalKirim: TanggalBisnis, tokoId: number, alasanFinalisasiUlang?: string) {
  const versi = (await bacaDraftRencana(cibubur, tanggalKirim))?.toko.find((t) => t.id === tokoId)?.versi ?? "";
  const hasil = await finalisasiRencanaToko({ idGudang: cibubur, tanggalKirim, tokoId, idPengguna: idOperator, versiDilihat: versi, alasanFinalisasiUlang });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  return hasil.idRencana;
}

const hitung = async (tanggalKirim: TanggalBisnis) => {
  const hasil = await hitungDraftRencana({ idGudang: cibubur, tanggalKirim, idPengguna: idOperator });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
};

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  cibubur = await idGudangUji("Gudang Cibubur");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, cibubur));
  [tokoA, tokoB] = [await buatTokoUji(), await buatTokoUji()];
  await db.insert(hubunganTokoGudang).values([tokoA, tokoB].map((t) => ({ tokoId: t.id, gudangId: cibubur })));
  await db.insert(jadwalToko).values(
    [tokoA, tokoB].map((t) => ({
      tokoId: t.id,
      pola: "mingguan" as const,
      hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }],
      dibuatOleh: idAdmin,
    })),
  );
  const tahunB = await tahunUjiBebas();
  tahunA = await tahunUjiBebas();
  sesuaiContoh = kuantitasJuniMenurutHari(tahunA, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunA,
    namaToko: tokoA.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.contoh, sesuaiContoh), produkUji(kode.manual, sesuaiContoh)],
  });
  await aktifkanImporJuniUji({ idAdmin, tahun: tahunB, namaToko: tokoB.nama, hari: SEMUA_HARI_JUNI, produk: [produkUji(kode.tokoB, SEMUA_HARI_JUNI.map(() => 2))] });
  await hitungUlangCacheLaporan();
  const periode = await tetapkanPeriodeSumber({ idGudang: cibubur, bulan: [`${tahunA}-06`, `${tahunB}-06`].sort(), idPengguna: idAdmin });
  if (periode.keadaan !== "berhasil") throw new Error(periode.pesan);
  const keluarga = await buatKeluargaUji();
  keluargaLain = (await buatKeluargaUji()).id;
  await publikasikanRankingUji({ keluarga: [keluarga.id], idPengguna: idAdmin });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: keluarga.id })
    .where(inArray(produk.kode, [kode.contoh, kode.tokoB]));

  await hitung(TANGGAL_1);
  await hitung(TANGGAL_2);
  await stok(TANGGAL_1, tokoA.id, kode.contoh, CONTOH.stokAkhir);
  await stok(TANGGAL_1, tokoB.id, kode.tokoB, 3);
  await stok(TANGGAL_2, tokoA.id, kode.contoh, CONTOH.stokAkhir);
  rencana.a1v1 = await finalisasi(TANGGAL_1, tokoA.id);
  rencana.b1 = await finalisasi(TANGGAL_1, tokoB.id);
  rencana.a2 = await finalisasi(TANGGAL_2, tokoA.id);
  // Versi 2 toko A tanggal 1 dengan stok lain; versi 1 tetap memakai stok 20.
  await stok(TANGGAL_1, tokoA.id, kode.contoh, 30);
  rencana.a1v2 = await finalisasi(TANGGAL_1, tokoA.id, ALASAN_ULANG);
}, 180_000);

afterAll(async () => {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, [tokoA.id, tokoB.id]));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, cibubur));
  await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, ALASAN_UJI));
});

beforeEach(() => {
  kepala.cookie = "";
});

async function masukOperator(idGudang: number, hakTindakan: HakTindakan[]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
}
const masukAdmin = async () => (kepala.cookie = (await kepalaPenggunaUji("admin")).cookie);

const bukaDaftar = async (filter: Record<string, string> = {}, idGudang: number | string = cibubur) =>
  renderToStaticMarkup(
    await HalamanRiwayatRencanaFinal({ params: Promise.resolve({ id: String(idGudang) }), searchParams: Promise.resolve(filter) }),
  );

const bukaRincian = async (idRencana: number | string, filter: Record<string, string> = {}, idGudang: number | string = cibubur) =>
  renderToStaticMarkup(
    await HalamanRincianRencanaFinal({
      params: Promise.resolve({ id: String(idGudang), idRencana: String(idRencana) }),
      searchParams: Promise.resolve(filter),
    }),
  );

/** Id rencana final di daftar, urut tampil. */
const idDiDaftar = (html: string) => [...html.matchAll(/<tr[^>]*data-rencana-final="(\d+)"/g)].map((m) => Number(m[1]));
const barisDaftar = (html: string, id: number) => new RegExp(`<tr[^>]*data-rencana-final="${id}".*?</tr>`).exec(html)?.[0] ?? "";
const barisVarian = (html: string, kodeProduk: string) => new RegExp(`<tr[^>]*data-kode-produk="${kodeProduk}".*?</tr>`).exec(html)?.[0] ?? "";
const bagianDasar = (html: string, nama: string) => new RegExp(`<section[^>]*data-dasar="${nama}".*?</section>`).exec(html)?.[0] ?? "";

const waktuFinal = async (id: number) => {
  const [r] = await db.select({ pada: rencanaFinal.difinalisasiPada }).from(rencanaFinal).where(eq(rencanaFinal.id, id));
  return formatWaktu(r.pada);
};

describe("daftar rencana final", () => {
  it("menampilkan semua versi per tanggal kirim dan toko, siapa dan kapan memfinalisasi; semua versi berstatus Final", async () => {
    // Operator tanpa hak tindakan punya akses lihat gudang (hanya-baca).
    await masukOperator(cibubur, []);
    const html = await bukaDaftar();
    // Zona kerja: tanpa blob latar, judul halaman zona kerja.
    expect(html).not.toContain("blur-3xl");
    expect(html).toMatch(/<h1[^>]*class="[^"]*text-2xl[^"]*md:text-3xl[^"]*"[^>]*>Riwayat rencana final/);
    // Tanggal kirim terbaru di atas; dalam satu tanggal urut nama toko, versi terbaru di atas.
    const tokoUrut = [tokoA, tokoB].sort((x, y) => x.nama.localeCompare(y.nama));
    const tanggal1 = tokoUrut.flatMap((t) => (t.id === tokoA.id ? [rencana.a1v2, rencana.a1v1] : [rencana.b1]));
    expect(idDiDaftar(html)).toEqual([rencana.a2, ...tanggal1]);

    const v2 = barisDaftar(html, rencana.a1v2);
    expect(v2).toContain("Senin, 08-06-2026");
    expect(v2).toContain(tokoA.nama);
    expect(v2).toMatch(/data-status="final".*?lucide-circle-check.*?Final/);
    expect(v2).toMatch(/data-versi-menggantikan[^>]*>Versi 2 menggantikan versi 1\.</);
    expect(v2).toContain(`Alasan: ${ALASAN_ULANG}`);
    expect(v2).toContain("Uji viewer");
    expect(v2).toContain(await waktuFinal(rencana.a1v2));
    expect(v2).toContain(`href="/pengiriman-gudang/${cibubur}/rencana-final/${rencana.a1v2}/rincian"`);

    const v1 = barisDaftar(html, rencana.a1v1);
    expect(v1).toMatch(/data-status="final".*?lucide-circle-check.*?Final/);
    expect(v1).not.toContain("Digantikan");
    expect(v1).toMatch(/Versi 1/);
    expect(v1).not.toContain("data-versi-menggantikan");
    expect(v1).toContain(await waktuFinal(rencana.a1v1));

    expect(barisDaftar(html, rencana.b1)).toMatch(/data-status="final"/);
    expect(barisDaftar(html, rencana.a2)).toContain("Senin, 15-06-2026");
  });

  it("filter tanggal kirim dan toko; nilai filter yang tidak dikenal diabaikan", async () => {
    await masukAdmin();
    expect(idDiDaftar(await bukaDaftar({ tanggal: TANGGAL_2 }))).toEqual([rencana.a2]);
    expect(idDiDaftar(await bukaDaftar({ toko: String(tokoB.id) }))).toEqual([rencana.b1]);
    expect(idDiDaftar(await bukaDaftar({ tanggal: TANGGAL_1, toko: String(tokoA.id) }))).toEqual([rencana.a1v2, rencana.a1v1]);
    expect(idDiDaftar(await bukaDaftar({ tanggal: TANGGAL_2, toko: String(tokoB.id) }))).toEqual([]);
    expect(await bukaDaftar({ tanggal: TANGGAL_2, toko: String(tokoB.id) })).toContain("Tidak ada rencana final yang cocok dengan filter ini.");
    expect(idDiDaftar(await bukaDaftar({ tanggal: "2026-02-30", toko: "bukan-angka" }))).toHaveLength(4);
    expect(idDiDaftar(await bukaDaftar({ tanggal: "semua", toko: "semua" }))).toHaveLength(4);
  });

  it("pilihan filter berisi tanggal kirim dan toko yang punya rencana final", async () => {
    await masukAdmin();
    const html = await bukaDaftar({ tanggal: TANGGAL_1 });
    const filter = /<form[^>]*data-filter-rencana-final.*?<\/form>/.exec(html)?.[0] ?? "";
    expect(filter).toMatch(/Tanggal kirim/);
    expect(filter).toMatch(/Toko/);
    expect(filter).toContain("Senin, 08-06-2026");
    expect(filter).toMatch(/<button[^>]*type="submit"[^>]*>Terapkan/);
  });
});

describe("rincian rencana final", () => {
  it("baris dan rincian perhitungan dari snapshot, beserta sumber, ranking, jadwal, dan kalender yang dipakai", async () => {
    await masukOperator(cibubur, []);
    const html = await bukaRincian(rencana.a1v1, { rincian: kode.contoh });
    expect(html).not.toContain("blur-3xl");
    expect(html).toMatch(new RegExp(`<h1[^>]*class="[^"]*text-2xl[^"]*md:text-3xl[^"]*"[^>]*>Rencana final ${tokoA.nama}</h1>`));
    expect(html).toContain("Tanggal kirim Senin, 08-06-2026");
    // Versi lama tetap utuh dan berstatus Final (status ikon + teks); tanpa penanda menggantikan.
    expect(html).toMatch(/data-status="final".*?lucide-circle-check.*?Final/);
    expect(html).toMatch(/<span[^>]*>Versi 1<\/span>/);
    expect(html).not.toContain("data-versi-menggantikan");
    expect(html).not.toContain("Digantikan");
    expect(html).toMatch(/Difinalisasi oleh<\/dt><dd[^>]*>Uji viewer</);
    expect(html).toContain(await waktuFinal(rencana.a1v1));
    expect(html).toContain("Ini bukan konfirmasi pengiriman fisik atau penerimaan barang.");

    // Sumber penjualan: bulan periode sumber dan identitas file impor yang dipakai.
    const [fileA] = await db
      .select({ namaFile: impor.namaFile, sha256: impor.sha256 })
      .from(impor)
      .where(and(eq(impor.tahunImpor, tahunA), eq(impor.status, "aktif")));
    const sumber = bagianDasar(html, "sumber");
    expect(sumber).toContain(`Juni ${tahunA}`);
    expect(sumber).toContain(fileA.namaFile);
    expect(sumber).toContain(fileA.sha256 ?? "tanpa-sha");
    expect(sumber).toContain("JUNI (S)");
    expect(bagianDasar(html, "ranking")).toMatch(/September 2026 versi \d+/);
    const jadwal = bagianDasar(html, "jadwal");
    expect(jadwal).toContain("Mingguan");
    expect(jadwal).toContain("Senin (H−2)");
    expect(jadwal).toContain("Panjang cakupan 7 hari");
    const kalender = bagianDasar(html, "kalender");
    expect(kalender).toMatch(/Revisi kalender/);
    for (const t of golden.kasusCakupan.tanggalCakupan) {
      expect(kalender).toMatch(new RegExp(`data-tanggal-cakupan="${t.tanggal}"[^>]*>.*?· ${t.kategoriEfektif}<`));
    }

    // Baris: golden 56 − 20 → 44 (versi 1 memakai stok 20 walaupun versi 2 memakai stok 30).
    const baris = barisVarian(html, kode.contoh);
    expect(baris).toMatch(new RegExp(`data-kebutuhan="${CONTOH.kebutuhan}"`));
    expect(baris).toMatch(new RegExp(`data-stok-akhir="${CONTOH.stokAkhir}"`));
    expect(baris).toMatch(new RegExp(`data-jumlah-kirim="${CONTOH.jumlahKirim}"`));
    expect(barisVarian(html, kode.manual)).toMatch(/data-status="manual"/);
    // Rincian perhitungan baris yang dibuka.
    const rincian = new RegExp(`<section[^>]*data-rincian-baris="${tokoA.id}\\|${kode.contoh}".*?</section>`).exec(html)?.[0] ?? "";
    expect(rincian).toContain("(4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56");
    expect(rincian).toContain("(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44");
    expect(rincian).toMatch(/keluarga aroma termasuk tujuh besar ranking pusat September 2026 versi \d+/);
    // Rata-rata dari snapshot, tanpa tautan ke Ringkasan yang membaca data terkini.
    expect(rincian).toMatch(/Rata-rata Sabtu:.*?10/);
    expect(rincian).not.toContain("/ringkasan?");
    expect(rincian).toContain(`href="/pengiriman-gudang/${cibubur}/rencana-final/${rencana.a1v1}/rincian"`);
  });

  it("versi baru: ditandai menggantikan versi sebelumnya beserta alasannya, dengan stok versinya sendiri", async () => {
    await masukAdmin();
    const html = await bukaRincian(rencana.a1v2);
    expect(html).toMatch(/data-status="final".*?lucide-circle-check.*?Final/);
    expect(html).toMatch(/data-versi-menggantikan[^>]*>Versi 2 menggantikan versi 1\.</);
    expect(html).toMatch(new RegExp(`Alasan finalisasi ulang</dt><dd[^>]*>${ALASAN_ULANG}<`));
    expect(html).toMatch(/<span[^>]*>Versi 2<\/span>/);
    expect(barisVarian(html, kode.contoh)).toMatch(/data-stok-akhir="30"/);
    expect(html).not.toContain("data-rincian-baris");
  });

  it("rincian final tetap sama setelah data sumber berubah", async () => {
    await masukOperator(cibubur, []);
    const sebelum = {
      daftar: await bukaDaftar(),
      v1: await bukaRincian(rencana.a1v1, { rincian: kode.contoh }),
      v2: await bukaRincian(rencana.a1v2, { rincian: kode.contoh }),
    };

    // Impor baru untuk bulan yang sama (penjualan dua kali lipat), kategori tanggal cakupan diubah, jadwal diubah, ranking
    // baru tanpa keluarga contoh, pemetaan diubah, stok diubah, lalu draft dihitung ulang.
    await aktifkanImporJuniUji({
      idAdmin,
      tahun: tahunA,
      namaToko: tokoA.nama,
      hari: SEMUA_HARI_JUNI,
      produk: [produkUji(kode.contoh, sesuaiContoh.map((q) => q * 2)), produkUji(kode.manual, sesuaiContoh)],
    });
    expect(
      await buatPerubahanKategori({ tanggal: parseTanggalBisnis("2026-06-10"), idToko: null, kategoriBaru: "Minggu", alasan: ALASAN_UJI, idPengguna: idAdmin }),
    ).toEqual({ keadaan: "berhasil" });
    await hitungUlangCacheLaporan();
    await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idAdmin, dinonaktifkanPada: new Date() })
      .where(and(eq(jadwalToko.tokoId, tokoA.id), eq(jadwalToko.status, "aktif")));
    await db.insert(jadwalToko).values({ tokoId: tokoA.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 1 }], dibuatOleh: idAdmin });
    await publikasikanRankingUji({ keluarga: [keluargaLain], idPengguna: idAdmin, bulanRanking: "2026-10" });
    const [pemetaan] = await terapkanPemetaan(idAdmin, [{ kodeProduk: kode.contoh, tujuan: { status: "terpetakan", idKeluarga: keluargaLain } }]);
    expect(pemetaan.status).toBe("berhasil");
    await hitung(TANGGAL_1);
    await stok(TANGGAL_1, tokoA.id, kode.contoh, 5);
    const barisDraft = (await bacaDraftRencana(cibubur, TANGGAL_1))?.toko.find((t) => t.id === tokoA.id)?.baris.find((b) => b.kodeProduk === kode.contoh);
    expect(barisDraft?.kebutuhan).not.toBe(CONTOH.kebutuhan);

    // Nama toko, produk, dan pemfinalisasi diubah di master.
    const [{ nama: namaPemfinalisasi }] = await db.select({ nama: user.name }).from(user).where(eq(user.id, idOperator));
    const [{ nama: namaProduk }] = await db.select({ nama: produk.nama }).from(produk).where(eq(produk.kode, kode.contoh));
    try {
      await db.update(toko).set({ nama: `${tokoA.nama} BARU` }).where(eq(toko.id, tokoA.id));
      await db.update(user).set({ name: "Nama baru operator" }).where(eq(user.id, idOperator));
      await db.update(produk).set({ nama: "NAMA PRODUK BARU" }).where(eq(produk.kode, kode.contoh));

      expect(await bukaDaftar()).toBe(sebelum.daftar);
      expect(await bukaRincian(rencana.a1v1, { rincian: kode.contoh })).toBe(sebelum.v1);
      expect(await bukaRincian(rencana.a1v2, { rincian: kode.contoh })).toBe(sebelum.v2);
    } finally {
      await db.update(toko).set({ nama: tokoA.nama }).where(eq(toko.id, tokoA.id));
      await db.update(user).set({ name: namaPemfinalisasi }).where(eq(user.id, idOperator));
      await db.update(produk).set({ nama: namaProduk }).where(eq(produk.kode, kode.contoh));
    }
  });
});

describe("tautan ke riwayat dan rincian", () => {
  it("halaman Pengiriman Gudang menautkan riwayat; layar berhasil menautkan rinciannya", async () => {
    await masukOperator(cibubur, []);
    const gudang = renderToStaticMarkup(
      await HalamanPengirimanGudang({ params: Promise.resolve({ id: String(cibubur) }), searchParams: Promise.resolve({}) }),
    );
    expect(gudang).toMatch(new RegExp(`<a[^>]*href="/pengiriman-gudang/${cibubur}/rencana-final"[^>]*>Riwayat rencana final</a>`));
    const berhasil = renderToStaticMarkup(
      await HalamanRencanaFinal({ params: Promise.resolve({ id: String(cibubur), idRencana: String(rencana.a1v2) }) }),
    );
    expect(berhasil).toMatch(
      new RegExp(`<a[^>]*href="/pengiriman-gudang/${cibubur}/rencana-final/${rencana.a1v2}/rincian"[^>]*>Lihat rincian rencana final</a>`),
    );
  });
});

describe("kewenangan riwayat rencana final (diperiksa di server)", () => {
  const ditolak = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ digest: expect.stringContaining("404") });

  it("operator gudang lain ditolak (404), walaupun punya semua hak tindakan di gudangnya", async () => {
    await masukOperator(await idGudangUji("Gudang Bali"), [...daftarHakTindakan]);
    await ditolak(bukaDaftar());
    await ditolak(bukaRincian(rencana.a1v1));
  });

  it("viewer tanpa penugasan ditolak; admin tanpa penugasan boleh melihat", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await ditolak(bukaDaftar());
    await ditolak(bukaRincian(rencana.a1v1));

    await masukAdmin();
    expect(idDiDaftar(await bukaDaftar())).toHaveLength(4);
    expect(await bukaRincian(rencana.a1v1)).toContain(`Rencana final ${tokoA.nama}`);
  });

  it("rencana final gudang lain, id tidak dikenal, atau id tidak valid → 404", async () => {
    await masukAdmin();
    await ditolak(bukaRincian(rencana.a1v1, {}, await idGudangUji("Gudang Bali")));
    await ditolak(bukaRincian(999_999_999));
    await ditolak(bukaRincian("bukan-angka"));
    await ditolak(bukaDaftar({}, "bukan-angka"));
  });
});
