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
import { buatTokoUji, idGudangUji, salinRencanaFinalRumusLama } from "@/server/gudang/uji-bantu";
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

import HalamanPengirimanGudang from "@/app/pengiriman-gudang/[id]/page";
import HalamanRencanaFinal from "@/app/pengiriman-gudang/[id]/rencana-final/[idRencana]/page";
import AlihkanRincianRencanaFinal from "@/app/pengiriman-gudang/[id]/rencana-final/[idRencana]/rincian/page";
import AlihkanRiwayatRencanaFinal from "@/app/pengiriman-gudang/[id]/rencana-final/page";

import HalamanRiwayat from "./page";
import HalamanRincianRencanaFinal from "./rencana-final/[idRencana]/page";

// T63: riwayat rencana final. T127: riwayat pindah ke halaman Riwayat (PRD A7 ▶ Keputusan 2026-10-14); semua pengguna
// yang sudah masuk membuka daftar rencana final semua gudang (filter gudang, toko, dan rentang tanggal kirim; siapa dan
// kapan memfinalisasi) dan rinciannya, semuanya dibaca dari snapshot (PRD A7, B9). Versi lama tetap
// tampil; versi baru ditandai "Versi N menggantikan versi N−1" (PRD A7 ▶ Keputusan 2026-10-11, T62). Zona kerja
// (DESIGN §1), status ikon + teks (DESIGN §7). Contoh PRD A6 / golden `jumlah-kirim.json`: kebutuhan 56, stok 20, tujuh
// besar → jumlah kirim 48 (stok target, PRD A6 ▶ Revisi 2026-10-14). T126: rencana final lama tetap dengan angka dan
// rincian rumus lama (golden `kasusJumlahKirimRumusLama`: → 44).

type KasusJumlahKirim = { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number };
type Golden = {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; kebutuhan: number; tanggalCakupan: { tanggal: string; kategoriEfektif: KategoriDasar }[] };
  kasusJumlahKirim: KasusJumlahKirim[];
  kasusJumlahKirimRumusLama: { kasus: KasusJumlahKirim[] };
};
const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../tests/golden/jumlah-kirim.json"), "utf8")) as Golden;
const [CONTOH] = golden.kasusJumlahKirim;
const [CONTOH_RUMUS_LAMA] = golden.kasusJumlahKirimRumusLama.kasus;

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

/** Halaman Riwayat, tab Rencana final, dengan filter gudang Cibubur (riwayat memuat semua gudang). */
const bukaDaftar = async (filter: Record<string, string> = {}) =>
  renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve({ gudang: String(cibubur), ...filter }) }));

const bukaRincian = async (idRencana: number | string, filter: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await HalamanRincianRencanaFinal({ params: Promise.resolve({ idRencana: String(idRencana) }), searchParams: Promise.resolve(filter) }),
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
    expect(html).toMatch(/<h1[^>]*class="[^"]*text-2xl[^"]*md:text-3xl[^"]*"[^>]*>Riwayat<\/h1>/);
    // Tab Rencana final terpilih (bawaan, tanpa ?tab=).
    const tab = /<nav aria-label="Jenis riwayat">.*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(tab).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/riwayat">Rencana final<\/a>/);
    // Tab Di luar jadwal belum ditampilkan (T128).
    expect(tab).not.toContain("Di luar jadwal");
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
    expect(v2).toContain(`href="/riwayat/rencana-final/${rencana.a1v2}"`);
    // T127: kolom Gudang (gudang aktif tanpa penanda nonaktif).
    expect(v2).toContain(">Gudang Cibubur<");
    expect(v2).not.toContain('data-status="gudangNonaktif"');
    // T121 (DESIGN §11.6): label tautan "Lihat rincian", bukan "Rincian" saja.
    expect(v2).toMatch(/<a[^>]*data-tautan-rincian-final="\d+"[^>]*>Lihat rincian<span class="sr-only">/);

    // T119 (DESIGN §11.9): versi lama tetap Final, dengan label versi penggantinya; versi terbaru tanpa label.
    expect(v2).not.toContain("Digantikan");
    const v1 = barisDaftar(html, rencana.a1v1);
    expect(v1).toMatch(/data-status="final".*?lucide-circle-check.*?Final.*?data-digantikan-oleh="2"[^>]*>Digantikan oleh versi 2</);
    expect(v1).toMatch(/Versi 1/);
    expect(v1).not.toContain("data-versi-menggantikan");
    expect(v1).toContain(await waktuFinal(rencana.a1v1));

    expect(barisDaftar(html, rencana.b1)).toMatch(/data-status="final"/);
    expect(barisDaftar(html, rencana.b1)).not.toContain("Digantikan");
    expect(barisDaftar(html, rencana.a2)).toContain("Senin, 15-06-2026");
  });

  it("filter rentang tanggal kirim dan toko; rentang kosong = semua; nilai filter yang tidak dikenal diabaikan", async () => {
    await masukAdmin();
    expect(idDiDaftar(await bukaDaftar({ dari: TANGGAL_2 }))).toEqual([rencana.a2]);
    expect(idDiDaftar(await bukaDaftar({ sampai: TANGGAL_1 }))).toHaveLength(3);
    expect(idDiDaftar(await bukaDaftar({ dari: TANGGAL_1, sampai: TANGGAL_2 }))).toHaveLength(4);
    expect(idDiDaftar(await bukaDaftar({ dari: "2026-06-09", sampai: "2026-06-14" }))).toEqual([]);
    expect(idDiDaftar(await bukaDaftar({ dari: "", sampai: "" }))).toHaveLength(4);
    expect(idDiDaftar(await bukaDaftar({ toko: String(tokoB.id) }))).toEqual([rencana.b1]);
    expect(idDiDaftar(await bukaDaftar({ dari: TANGGAL_1, sampai: TANGGAL_1, toko: String(tokoA.id) }))).toEqual([rencana.a1v2, rencana.a1v1]);
    expect(idDiDaftar(await bukaDaftar({ dari: TANGGAL_2, toko: String(tokoB.id) }))).toEqual([]);
    expect(await bukaDaftar({ dari: TANGGAL_2, toko: String(tokoB.id) })).toContain("Tidak ada rencana final yang cocok dengan filter ini.");
    expect(idDiDaftar(await bukaDaftar({ dari: "2026-02-30", sampai: "bukan-tanggal", toko: "bukan-angka" }))).toHaveLength(4);
    expect(idDiDaftar(await bukaDaftar({ toko: "semua" }))).toHaveLength(4);
  });

  it("filter gudang: semua gudang memuat rencana final Cibubur dan gudang lain; gudang tidak dikenal = semua", async () => {
    await masukAdmin();
    const semua = idDiDaftar(renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve({ toko: String(tokoA.id) }) })));
    expect(semua).toEqual([rencana.a2, rencana.a1v2, rencana.a1v1]);
    const bali = await idGudangUji("Gudang Bali");
    expect(idDiDaftar(await bukaDaftar({ gudang: String(bali) }))).toEqual([]);
    const takDikenal = renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve({ gudang: "999999999", toko: String(tokoA.id) }) }));
    expect(idDiDaftar(takDikenal)).toEqual(semua);
  });

  it("form filter: gudang, toko, rentang tanggal kirim dari–sampai berisi nilai terapan, cari, dan tombol Terapkan", async () => {
    await masukAdmin();
    const html = await bukaDaftar({ dari: TANGGAL_1, sampai: TANGGAL_2 });
    const filter = /<form[^>]*data-filter-rencana-final.*?<\/form>/.exec(html)?.[0] ?? "";
    expect(filter).toMatch(/<form[^>]*action="\/riwayat"/);
    expect(filter).toMatch(/Gudang/);
    expect(filter).toContain("Gudang Cibubur");
    expect(filter).toMatch(/Toko/);
    expect(filter).toMatch(/<label[^>]*>Tanggal kirim dari<\/label><input[^>]*type="date"[^>]*name="dari"[^>]*value="2026-06-08"/);
    expect(filter).toMatch(/<label[^>]*>Tanggal kirim sampai<\/label><input[^>]*type="date"[^>]*name="sampai"[^>]*value="2026-06-15"/);
    expect(filter).toMatch(/name="cari"/);
    expect(filter).toMatch(/<button[^>]*type="submit"[^>]*>Terapkan/);
    // Tanpa isian tanggal: kedua isian kosong.
    const kosong = /<form[^>]*data-filter-rencana-final.*?<\/form>/.exec(await bukaDaftar())?.[0] ?? "";
    expect(kosong).toMatch(/name="dari"[^>]*value=""/);
    expect(kosong).toMatch(/name="sampai"[^>]*value=""/);
  });
});

describe("rincian rencana final", () => {
  it("baris dan rincian perhitungan dari snapshot, beserta sumber, ranking, jadwal, dan kalender yang dipakai", async () => {
    await masukOperator(cibubur, []);
    const html = await bukaRincian(rencana.a1v1, { rincian: kode.contoh });
    expect(html).not.toContain("blur-3xl");
    // DESIGN §11.8 (T122): tabel rincian lebar, jadi halamannya max-w-7xl (pengecualian §9), bukan max-w-3xl.
    expect(html).toMatch(/^<main class="[^"]*\bmax-w-7xl\b/);
    expect(html).not.toMatch(/^<main class="[^"]*\bmax-w-3xl\b/);
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
    // T121 (DESIGN §11.6): SHA-256, ukuran byte, dan nomor penetapan hanya di "Detail teknis" yang awalnya tertutup;
    // datanya tetap ada di DOM.
    const detailTeknis = /<details data-detail-teknis[^>]*>.*?<\/details>/.exec(sumber)?.[0] ?? "";
    expect(detailTeknis).not.toMatch(/^<details[^>]*\bopen\b/);
    expect(detailTeknis).toMatch(/<summary[^>]*>Detail teknis/);
    expect(detailTeknis).toContain(fileA.sha256 ?? "tanpa-sha");
    expect(detailTeknis).toMatch(/[\d.]+ byte/);
    expect(detailTeknis).toMatch(/Nomor penetapan periode sumber: #\d+/);
    const luarDetail = sumber.replace(detailTeknis, "");
    expect(luarDetail).not.toContain(fileA.sha256 ?? "tanpa-sha");
    expect(luarDetail).not.toContain("byte");
    expect(luarDetail).not.toContain("penetapan");
    expect(bagianDasar(html, "ranking")).toMatch(/September 2026 versi \d+/);
    const jadwal = bagianDasar(html, "jadwal");
    expect(jadwal).toContain("Mingguan");
    expect(jadwal).toContain("Senin (H−2)");
    expect(jadwal).toContain('data-teks-cakupan="Cakupan 9 hari: persiapan 2 hari + 7 hari sampai sebelum kiriman berikutnya"');
    const kalender = bagianDasar(html, "kalender");
    expect(kalender).toMatch(/Revisi kalender/);
    for (const t of golden.kasusCakupan.tanggalCakupan) {
      expect(kalender).toMatch(new RegExp(`data-tanggal-cakupan="${t.tanggal}"[^>]*>.*?· ${t.kategoriEfektif}<`));
    }

    // Baris: golden 56, stok 20 → 48 (versi 1 memakai stok 20 walaupun versi 2 memakai stok 30).
    const baris = barisVarian(html, kode.contoh);
    expect(baris).toMatch(new RegExp(`data-kebutuhan="${CONTOH.kebutuhan}"`));
    expect(baris).toMatch(new RegExp(`data-stok-akhir="${CONTOH.stokAkhir}"`));
    expect(baris).toMatch(new RegExp(`data-jumlah-kirim="${CONTOH.jumlahKirim}"`));
    expect(barisVarian(html, kode.manual)).toMatch(/data-status="manual"/);
    // Rincian perhitungan baris yang dibuka.
    const rincian = new RegExp(`<section[^>]*data-rincian-baris="${tokoA.id}\\|${kode.contoh}".*?</section>`).exec(html)?.[0] ?? "";
    expect(rincian).toContain("(4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56");
    // T126: rencana final baru memakai stok target (PRD A6 ▶ Revisi 2026-10-14).
    expect(rincian).toContain("56 × 120% − 20 = 47,2 → dibulatkan ke atas 48");
    expect(rincian).toMatch(new RegExp(`data-jumlah-kirim-rincian="${CONTOH.jumlahKirim}"`));
    expect(rincian).toMatch(/keluarga aroma termasuk tujuh besar ranking pusat September 2026 versi \d+/);
    // Rata-rata dari snapshot, tanpa tautan ke Ringkasan yang membaca data terkini.
    expect(rincian).toMatch(/Rata-rata Sabtu:.*?10/);
    expect(rincian).not.toContain("/ringkasan?");
    // T108 (DESIGN §11.2): `?rincian=` langsung membuka panel samping berjudul baris itu, dengan tombol Tutup, di luar tabel.
    const panel = /<div[^>]*role="dialog"[^>]*>.*$/s.exec(html)?.[0] ?? "";
    expect(panel).toMatch(/data-bentuk="samping"/);
    expect(panel).toContain(`>Rincian perhitungan ${kode.contoh} · ${tokoA.nama}</h2>`);
    expect(panel).toMatch(/<button[^>]*>.*?Tutup<\/button>/);
    expect(panel).toContain(rincian);
    expect(html.indexOf('role="dialog"')).toBeGreaterThan(html.lastIndexOf("</table>"));
    // Tautan pembuka: navigasi tanpa jangkar ke halaman yang sama.
    expect(baris).toContain(`href="/riwayat/rencana-final/${rencana.a1v1}?rincian=${encodeURIComponent(kode.contoh)}"`);
    expect(baris).toContain(`Lihat rincian<span class="sr-only"> perhitungan ${kode.contoh}</span>`);
  });

  it("rencana final dengan rumus lama (sebelum PRD A6 ▶ Revisi 2026-10-14) tetap menampilkan jumlah kirim dan rincian rumus lama", async () => {
    expect(CONTOH_RUMUS_LAMA).toMatchObject({ kebutuhan: CONTOH.kebutuhan, stokAkhir: CONTOH.stokAkhir, persenBuffer: CONTOH.persenBuffer });
    // Rencana final dari sebelum migrasi 0028: snapshot versi 1 toko A dengan jumlah kirim rumus lama.
    const idLama = await salinRencanaFinalRumusLama({
      idRencana: rencana.a1v1,
      tanggalKirim: "2026-06-01",
      kodeProduk: kode.contoh,
      jumlahKirimLama: CONTOH_RUMUS_LAMA.jumlahKirim,
    });
    try {
      await masukOperator(cibubur, []);
      const html = await bukaRincian(idLama, { rincian: kode.contoh });
      expect(barisVarian(html, kode.contoh)).toMatch(new RegExp(`data-jumlah-kirim="${CONTOH_RUMUS_LAMA.jumlahKirim}"`));
      const rincian = new RegExp(`<section[^>]*data-rincian-baris="${tokoA.id}\\|${kode.contoh}".*?</section>`).exec(html)?.[0] ?? "";
      expect(rincian).toContain("(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44");
      expect(rincian).toMatch(new RegExp(`data-jumlah-kirim-rincian="${CONTOH_RUMUS_LAMA.jumlahKirim}"`));
      expect(rincian).not.toContain("56 × 120% − 20");
    } finally {
      await db.delete(rencanaFinal).where(eq(rencanaFinal.id, idLama));
    }
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
    expect(html).not.toContain('role="dialog"');
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
  it("halaman Pengiriman Gudang tidak lagi menautkan riwayat rencana final; layar berhasil menautkan rincian di Riwayat", async () => {
    await masukOperator(cibubur, []);
    const gudang = renderToStaticMarkup(
      await HalamanPengirimanGudang({ params: Promise.resolve({ id: String(cibubur) }), searchParams: Promise.resolve({}) }),
    );
    expect(gudang).not.toContain("Riwayat rencana final");
    expect(gudang).not.toContain(`/pengiriman-gudang/${cibubur}/rencana-final"`);
    expect(gudang).not.toContain("data-tautan-riwayat-final");
    const berhasil = renderToStaticMarkup(
      await HalamanRencanaFinal({ params: Promise.resolve({ id: String(cibubur), idRencana: String(rencana.a1v2) }) }),
    );
    expect(berhasil).toMatch(new RegExp(`<a[^>]*href="/riwayat/rencana-final/${rencana.a1v2}"[^>]*>Lihat rincian rencana final</a>`));
  });

  it("rincian: tautan kembali ke Riwayat; kolom Gudang", async () => {
    await masukOperator(cibubur, []);
    const html = await bukaRincian(rencana.a1v1);
    expect(html).toMatch(/<a[^>]*href="\/riwayat"[^>]*>.*?Riwayat<\/a>/);
    expect(html).toMatch(/Gudang<\/dt><dd[^>]*>Gudang Cibubur</);
  });

  it("alamat lama dialihkan: riwayat gudang → /riwayat?gudang=<id>; rincian → /riwayat/rencana-final/<id> (panel tetap)", async () => {
    const tujuan = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) });
    const lokasi = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (galat) {
        return String((galat as { digest?: string }).digest).split(";")[2];
      }
      return null;
    };
    await tujuan(AlihkanRiwayatRencanaFinal({ params: Promise.resolve({ id: String(cibubur) }) }));
    expect(await lokasi(AlihkanRiwayatRencanaFinal({ params: Promise.resolve({ id: String(cibubur) }) }))).toBe(`/riwayat?gudang=${cibubur}`);
    expect(await lokasi(AlihkanRiwayatRencanaFinal({ params: Promise.resolve({ id: "bukan-angka" }) }))).toBe("/riwayat");
    expect(
      await lokasi(
        AlihkanRincianRencanaFinal({ params: Promise.resolve({ id: String(cibubur), idRencana: String(rencana.a1v1) }), searchParams: Promise.resolve({}) }),
      ),
    ).toBe(`/riwayat/rencana-final/${rencana.a1v1}`);
    expect(
      await lokasi(
        AlihkanRincianRencanaFinal({
          params: Promise.resolve({ id: String(cibubur), idRencana: String(rencana.a1v1) }),
          searchParams: Promise.resolve({ rincian: kode.contoh }),
        }),
      ),
    ).toBe(`/riwayat/rencana-final/${rencana.a1v1}?rincian=${encodeURIComponent(kode.contoh)}`);
  });
});

describe("kewenangan riwayat rencana final (diperiksa di server)", () => {
  const ditolak = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ digest: expect.stringContaining("404") });

  it("belum masuk → diarahkan ke halaman masuk", async () => {
    const keMasuk = { digest: expect.stringContaining(";/masuk;") };
    await expect(HalamanRiwayat({ searchParams: Promise.resolve({}) })).rejects.toMatchObject(keMasuk);
    await expect(
      HalamanRincianRencanaFinal({ params: Promise.resolve({ idRencana: String(rencana.a1v1) }), searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject(keMasuk);
  });

  it("operator yang hanya ditugaskan di gudang lain melihat riwayat dan rincian Cibubur, tetapi tetap 404 di Pengiriman Gudang Cibubur", async () => {
    await masukOperator(await idGudangUji("Gudang Bali"), [...daftarHakTindakan]);
    expect(idDiDaftar(await bukaDaftar())).toHaveLength(4);
    expect(await bukaRincian(rencana.a1v1)).toContain(`Rencana final ${tokoA.nama}`);
    await ditolak(HalamanPengirimanGudang({ params: Promise.resolve({ id: String(cibubur) }), searchParams: Promise.resolve({}) }));
  });

  it("viewer tanpa penugasan dan admin tanpa penugasan melihat riwayat dan rincian; viewer tetap 404 di Pengiriman Gudang", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    expect(idDiDaftar(await bukaDaftar())).toHaveLength(4);
    expect(await bukaRincian(rencana.a1v1)).toContain(`Rencana final ${tokoA.nama}`);
    await ditolak(HalamanPengirimanGudang({ params: Promise.resolve({ id: String(cibubur) }), searchParams: Promise.resolve({}) }));

    await masukAdmin();
    expect(idDiDaftar(await bukaDaftar())).toHaveLength(4);
    expect(await bukaRincian(rencana.a1v1)).toContain(`Rencana final ${tokoA.nama}`);
  });

  it("id rencana final tidak dikenal atau tidak valid → 404", async () => {
    await masukAdmin();
    await ditolak(bukaRincian(999_999_999));
    await ditolak(bukaRincian("bukan-angka"));
  });
});
