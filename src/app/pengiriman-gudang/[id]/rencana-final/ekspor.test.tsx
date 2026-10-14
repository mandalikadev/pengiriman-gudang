import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { formatWaktu } from "@/app/admin/impor/format";
import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, gudang, hubunganTokoGudang, impor, jadwalToko, produk, rencanaFinal, toko, user } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { finalisasiRencanaToko } from "@/server/gudang/rencana-final";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { kodeProdukUji, tahunUjiBebas } from "@/server/impor/uji-bantu";
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

import HalamanRiwayat from "@/app/riwayat/page";
import HalamanRincianRencanaFinal from "@/app/riwayat/rencana-final/[idRencana]/page";

import { GET } from "./[idRencana]/ekspor/route";

// T64: ekspor rencana final (.xlsx). Hanya rencana final (termasuk dari riwayat) dan hanya untuk pengguna dengan hak
// tindakan `ekspor` di gudang itu (PRD A7 ▶ Keputusan 2026-10-09). Isinya dibaca dari snapshot finalisasi, bukan data
// terkini. Contoh PRD A6 / golden `jumlah-kirim.json`: kebutuhan 56, stok 20, tujuh besar (buffer 20%) → jumlah kirim 48
// (stok target, PRD A6 ▶ Revisi 2026-10-14).

type Golden = {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string };
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
};
const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../../tests/golden/jumlah-kirim.json"), "utf8")) as Golden;
const [CONTOH] = golden.kasusJumlahKirim;

const TANGGAL = parseTanggalBisnis(golden.kasusCakupan.tanggalKirim);
const SEMUA_HARI_JUNI = Array.from({ length: 30 }, (_, i) => i + 1);
const kategoriHari = (nama: NamaHari): KategoriDasar =>
  nama === "Jumat" || nama === "Sabtu" || nama === "Minggu" ? nama : "Senin–Kamis";
const NAMA_PRODUK = "15ML GLITTER - GORGEOUS";
const produkUji = (kode: string, kuantitas: number[]) => ({ kode, nama: NAMA_PRODUK, ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas });
const JENIS_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let cibubur: number;
let idAdmin: string;
let idOperator: string;
let tokoA: { id: number; nama: string };
let tahun: number;
let sesuaiContoh: number[];
let keluargaLain: number;
let idRencana: number;
const kode = { contoh: kodeProdukUji("GOR"), manual: kodeProdukUji("GOR-T") };

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  cibubur = await idGudangUji("Gudang Cibubur");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, cibubur));
  tokoA = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: tokoA.id, gudangId: cibubur });
  await db.insert(jadwalToko).values({
    tokoId: tokoA.id,
    pola: "mingguan",
    hariKirim: [{ hari: "Senin", persiapanHari: 2 }],
    dibuatOleh: idAdmin,
  });
  tahun = await tahunUjiBebas();
  sesuaiContoh = kuantitasJuniMenurutHari(tahun, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({
    idAdmin,
    tahun,
    namaToko: tokoA.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.contoh, sesuaiContoh), produkUji(kode.manual, sesuaiContoh)],
  });
  await hitungUlangCacheLaporan();
  const periode = await tetapkanPeriodeSumber({ idGudang: cibubur, bulan: [`${tahun}-06`], idPengguna: idAdmin });
  if (periode.keadaan !== "berhasil") throw new Error(periode.pesan);
  const keluarga = await buatKeluargaUji();
  keluargaLain = (await buatKeluargaUji()).id;
  await publikasikanRankingUji({ keluarga: [keluarga.id], idPengguna: idAdmin });
  await db.update(produk).set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: keluarga.id }).where(eq(produk.kode, kode.contoh));

  const dihitung = await hitungDraftRencana({ idGudang: cibubur, tanggalKirim: TANGGAL, idPengguna: idOperator });
  if (dihitung.keadaan !== "berhasil") throw new Error(dihitung.pesan);
  const stok = await simpanStokToko({ idGudang: cibubur, tanggalKirim: TANGGAL, tokoId: tokoA.id, stok: [{ kodeProduk: kode.contoh, stokAkhir: CONTOH.stokAkhir }] });
  if (stok.keadaan !== "berhasil") throw new Error(stok.pesan);
  const versi = (await bacaDraftRencana(cibubur, TANGGAL))?.toko.find((t) => t.id === tokoA.id)?.versi ?? "";
  const hasil = await finalisasiRencanaToko({ idGudang: cibubur, tanggalKirim: TANGGAL, tokoId: tokoA.id, idPengguna: idOperator, versiDilihat: versi });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  idRencana = hasil.idRencana;
}, 180_000);

afterAll(async () => {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, [tokoA.id]));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, cibubur));
});

beforeEach(() => {
  kepala.cookie = "";
});

async function masukOperator(idGudang: number, hakTindakan: HakTindakan[]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
}

const ekspor = (id: number | string = idRencana, idGudang: number | string = cibubur) =>
  GET(new Request(`http://localhost/pengiriman-gudang/${idGudang}/rencana-final/${id}/ekspor`), {
    params: Promise.resolve({ id: String(idGudang), idRencana: String(id) }),
  });

type Sel = string | number | null;

/** Isi sheet "Rencana final": bagian kepala (label → nilai-nilai) dan baris data di bawah judul kolom. */
async function baca(respons: Response) {
  const wb = XLSX.read(new Uint8Array(await respons.arrayBuffer()), { type: "array" });
  expect(wb.SheetNames).toEqual(["Rencana final"]);
  const semua = XLSX.utils.sheet_to_json<Sel[]>(wb.Sheets["Rencana final"], { header: 1, defval: null });
  const indeksJudul = semua.findIndex((b) => b[0] === "Kode produk");
  const kolom = semua[indeksJudul] as string[];
  const kepalaBerkas = semua.slice(0, indeksJudul).filter((b) => b.length >= 2);
  const nilai = (label: string) => kepalaBerkas.find((b) => b[0] === label)?.[1];
  const semuaNilai = (label: string) => kepalaBerkas.filter((b) => b[0] === label).map((b) => b.slice(1).filter((s) => s !== null));
  const baris = semua.slice(indeksJudul + 1).map((b) => Object.fromEntries(kolom.map((k, i) => [k, b[i]])));
  return { semua, nilai, semuaNilai, kolom, baris };
}

describe("GET ekspor rencana final: kewenangan (diperiksa di server)", () => {
  const ditolak = async (respons: Response, status: number) => {
    expect(respons.status).toBe(status);
    expect(respons.headers.get("content-type")).toContain("application/json");
    expect(respons.headers.get("content-disposition")).toBeNull();
    return ((await respons.json()) as { pesan: string }).pesan;
  };

  it("pengguna belum masuk ditolak (401)", async () => {
    expect(await ditolak(await ekspor(), 401)).toContain("belum masuk");
  });

  it("admin tanpa penugasan ditolak (403), walaupun boleh melihat rencana final", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    expect(await ditolak(await ekspor(), 403)).toContain("hak ekspor");
  });

  it("operator gudang itu tanpa hak ekspor ditolak (403), walaupun punya semua hak lain", async () => {
    await masukOperator(cibubur, daftarHakTindakan.filter((h) => h !== "ekspor"));
    expect(await ditolak(await ekspor(), 403)).toContain("hak ekspor");
  });

  it("operator dengan hak ekspor di gudang lain ditolak (403)", async () => {
    await masukOperator(await idGudangUji("Gudang Bali"), ["ekspor"]);
    expect(await ditolak(await ekspor(), 403)).toContain("hak ekspor");
  });

  it("viewer tanpa penugasan ditolak (403)", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await ditolak(await ekspor(), 403);
  });

  it("rencana final milik gudang lain, id tidak dikenal, atau id tidak valid → 404", async () => {
    const bali = await idGudangUji("Gudang Bali");
    await masukOperator(bali, ["ekspor"]);
    await ditolak(await ekspor(idRencana, bali), 404);
    await masukOperator(cibubur, ["ekspor"]);
    await ditolak(await ekspor(999_999_999), 404);
    await ditolak(await ekspor("bukan-angka"), 404);
    await ditolak(await ekspor(idRencana, "bukan-angka"), 404);
  });
});

describe("GET ekspor rencana final: isi berkas dari snapshot", () => {
  it("berkas .xlsx berisi gudang, tanggal kirim, toko, waktu finalisasi, identitas sumber, ranking, dan baris rencana", async () => {
    await masukOperator(cibubur, ["ekspor"]);
    const respons = await ekspor();
    expect(respons.status).toBe(200);
    expect(respons.headers.get("content-type")).toBe(JENIS_XLSX);
    expect(respons.headers.get("content-disposition")).toMatch(/^attachment; filename="rencana-final-[A-Za-z0-9-]+-2026-06-08-v1\.xlsx"$/);
    const { nilai, semuaNilai, kolom, baris } = await baca(respons);

    expect(nilai("Gudang")).toBe("Gudang Cibubur");
    expect(nilai("Tanggal kirim")).toBe("Senin, 08-06-2026");
    expect(nilai("Toko")).toBe(tokoA.nama);
    const [r] = await db.select({ pada: rencanaFinal.difinalisasiPada }).from(rencanaFinal).where(eq(rencanaFinal.id, idRencana));
    expect(nilai("Waktu finalisasi")).toBe(formatWaktu(r.pada));
    expect(nilai("Periode sumber")).toMatch(new RegExp(`^Juni ${tahun} \\(penetapan #\\d+\\)$`));
    expect(nilai("Ranking pusat")).toMatch(/^September 2026 versi \d+$/);
    const [file] = await db
      .select({ namaFile: impor.namaFile, sha256: impor.sha256, namaSheet: impor.namaSheet })
      .from(impor)
      .where(and(eq(impor.tahunImpor, tahun), eq(impor.status, "aktif")));
    expect(semuaNilai("Impor sumber")).toEqual([[`Juni ${tahun}`, file.namaSheet, file.namaFile, expect.stringMatching(/ byte$/), file.sha256]]);

    expect(kolom).toEqual(["Kode produk", "Nama produk", "Kebutuhan barang", "Stok akhir", "Buffer (%)", "Jumlah kirim", "Status"]);
    expect(baris.map((b) => b["Kode produk"])).toEqual([kode.contoh, kode.manual].sort());
    // Golden: 56 × 120% − 20 → 48 dengan buffer tujuh besar 20%.
    expect(baris.find((b) => b["Kode produk"] === kode.contoh)).toEqual({
      "Kode produk": kode.contoh,
      "Nama produk": NAMA_PRODUK,
      "Kebutuhan barang": CONTOH.kebutuhan,
      "Stok akhir": CONTOH.stokAkhir,
      "Buffer (%)": CONTOH.persenBuffer,
      "Jumlah kirim": CONTOH.jumlahKirim,
      Status: "Otomatis",
    });
    // Produk manual: status "Manual", tanpa buffer dan jumlah kirim; stok yang belum diisi ditulis "—", bukan 0.
    expect(baris.find((b) => b["Kode produk"] === kode.manual)).toMatchObject({
      "Nama produk": NAMA_PRODUK,
      "Stok akhir": "—",
      "Buffer (%)": "—",
      "Jumlah kirim": "—",
      Status: "Manual",
    });
  });

  it("status setiap baris sama dengan label yang tampil di layar rincian untuk baris yang sama (T77)", async () => {
    await masukOperator(cibubur, ["ekspor"]);
    const { baris } = await baca(await ekspor());
    const rincian = renderToStaticMarkup(
      await HalamanRincianRencanaFinal({ params: Promise.resolve({ idRencana: String(idRencana) }), searchParams: Promise.resolve({}) }),
    );
    // Kolom ketiga tabel baris rencana di layar (Klasifikasi), tanpa tag dan teks khusus pembaca layar.
    const labelLayar = (kodeProduk: string) => {
      const tr = new RegExp(`<tr[^>]*data-kode-produk="${kodeProduk}".*?</tr>`).exec(rincian)?.[0] ?? "";
      const sel = [...tr.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
      return (sel[2] ?? "").replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, "").trim();
    };
    expect(baris).toHaveLength(2);
    for (const b of baris) {
      const label = labelLayar(String(b["Kode produk"]));
      expect(label).not.toBe("");
      expect(b.Status).toBe(label);
    }
    expect(Object.fromEntries(baris.map((b) => [b["Kode produk"], b.Status]))).toEqual({ [kode.contoh]: "Otomatis", [kode.manual]: "Manual" });
  });

  it("isi berkas sama dengan snapshot walau data sumber sudah berubah", async () => {
    await masukOperator(cibubur, ["ekspor"]);
    const sebelum = (await baca(await ekspor())).semua;

    // Impor baru (penjualan dua kali lipat), ranking baru tanpa keluarga contoh, pemetaan diubah, draft dihitung ulang
    // dengan stok lain, serta nama gudang, toko, produk, dan pemfinalisasi diubah di master.
    await aktifkanImporJuniUji({
      idAdmin,
      tahun,
      namaToko: tokoA.nama,
      hari: SEMUA_HARI_JUNI,
      produk: [produkUji(kode.contoh, sesuaiContoh.map((q) => q * 2)), produkUji(kode.manual, sesuaiContoh)],
    });
    await hitungUlangCacheLaporan();
    await publikasikanRankingUji({ keluarga: [keluargaLain], idPengguna: idAdmin, bulanRanking: "2026-10" });
    const [pemetaan] = await terapkanPemetaan(idAdmin, [{ kodeProduk: kode.contoh, tujuan: { status: "terpetakan", idKeluarga: keluargaLain } }]);
    expect(pemetaan.status).toBe("berhasil");
    const dihitung = await hitungDraftRencana({ idGudang: cibubur, tanggalKirim: TANGGAL, idPengguna: idOperator });
    if (dihitung.keadaan !== "berhasil") throw new Error(dihitung.pesan);
    await simpanStokToko({ idGudang: cibubur, tanggalKirim: TANGGAL, tokoId: tokoA.id, stok: [{ kodeProduk: kode.contoh, stokAkhir: 5 }] });
    const barisDraft = (await bacaDraftRencana(cibubur, TANGGAL))?.toko.find((t) => t.id === tokoA.id)?.baris.find((b) => b.kodeProduk === kode.contoh);
    expect(barisDraft?.kebutuhan).not.toBe(CONTOH.kebutuhan);

    const [{ nama: namaPemfinalisasi }] = await db.select({ nama: user.name }).from(user).where(eq(user.id, idOperator));
    const [{ nama: namaGudang }] = await db.select({ nama: gudang.nama }).from(gudang).where(eq(gudang.id, cibubur));
    try {
      await db.update(gudang).set({ nama: `${namaGudang} BARU` }).where(eq(gudang.id, cibubur));
      await db.update(toko).set({ nama: `${tokoA.nama} BARU` }).where(eq(toko.id, tokoA.id));
      await db.update(user).set({ name: "Nama baru operator" }).where(eq(user.id, idOperator));
      await db.update(produk).set({ nama: "NAMA PRODUK BARU" }).where(eq(produk.kode, kode.contoh));

      const sesudah = await baca(await ekspor());
      expect(sesudah.semua).toEqual(sebelum);
      expect(sesudah.nilai("Gudang")).toBe(namaGudang);
      expect(sesudah.nilai("Toko")).toBe(tokoA.nama);
      expect(sesudah.baris.find((b) => b["Kode produk"] === kode.contoh)).toMatchObject({
        "Nama produk": NAMA_PRODUK,
        "Kebutuhan barang": CONTOH.kebutuhan,
        "Stok akhir": CONTOH.stokAkhir,
        "Jumlah kirim": CONTOH.jumlahKirim,
      });
    } finally {
      await db.update(gudang).set({ nama: namaGudang }).where(eq(gudang.id, cibubur));
      await db.update(toko).set({ nama: tokoA.nama }).where(eq(toko.id, tokoA.id));
      await db.update(user).set({ name: namaPemfinalisasi }).where(eq(user.id, idOperator));
      await db.update(produk).set({ nama: NAMA_PRODUK }).where(eq(produk.kode, kode.contoh));
    }
  });
});

describe("tombol ekspor di rincian dan riwayat rencana final (zona kerja; halaman Riwayat T127, route ekspor tidak berubah)", () => {
  const urlEkspor = () => `/pengiriman-gudang/${cibubur}/rencana-final/${idRencana}/ekspor`;
  const bukaRincian = async () =>
    renderToStaticMarkup(
      await HalamanRincianRencanaFinal({ params: Promise.resolve({ idRencana: String(idRencana) }), searchParams: Promise.resolve({}) }),
    );
  /** Halaman Riwayat (T127), tab Rencana final, dengan filter gudang Cibubur. */
  const bukaDaftar = async () => renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve({ gudang: String(cibubur) }) }));
  const tombol = () => new RegExp(`<button[^>]*data-ekspor-url="${urlEkspor()}"[^>]*>.*?lucide-download[^>]*size-5.*?Ekspor \\(\\.xlsx\\)`);

  it("operator dengan hak ekspor melihat tombol Ekspor (.xlsx) di rincian dan di baris riwayat", async () => {
    await masukOperator(cibubur, ["ekspor"]);
    const rincian = await bukaRincian();
    expect(rincian).not.toContain("blur-3xl");
    expect(rincian).toMatch(tombol());

    const daftar = await bukaDaftar();
    const baris = new RegExp(`<tr[^>]*data-rencana-final="${idRencana}".*?</tr>`).exec(daftar)?.[0] ?? "";
    expect(baris).toMatch(tombol());
    // Konteks untuk pembaca layar: tiap baris riwayat punya tombol sendiri.
    expect(baris).toMatch(new RegExp(`Ekspor \\(\\.xlsx\\)<span class="sr-only"> rencana final ${tokoA.nama} Senin, 08-06-2026 versi 1</span>`));
  });

  it("tanpa hak ekspor (operator lain atau admin tanpa penugasan) tombol tidak tampil", async () => {
    await masukOperator(cibubur, daftarHakTindakan.filter((h) => h !== "ekspor"));
    expect(await bukaRincian()).not.toContain("data-ekspor-url");
    expect(await bukaDaftar()).not.toContain("data-ekspor-url");

    // Admin tanpa penugasan hanya punya tombol ekspor halaman Riwayat (T129), bukan ekspor per rencana final.
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    expect(await bukaRincian()).not.toContain("data-ekspor-url");
    expect(await bukaDaftar()).not.toContain('data-ekspor-url="/pengiriman-gudang/');
  });

  it("T127: hak ekspor di gudang lain tidak memunculkan tombol untuk rencana Cibubur; viewer tanpa penugasan tanpa tombol", async () => {
    // Hak ekspor di Gudang Bali hanya memunculkan tombol ekspor halaman Riwayat (T129), bukan ekspor rencana Cibubur.
    await masukOperator(await idGudangUji("Gudang Bali"), ["ekspor"]);
    expect(await bukaRincian()).not.toContain("data-ekspor-url");
    expect(await bukaDaftar()).not.toContain('data-ekspor-url="/pengiriman-gudang/');

    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    expect(await bukaRincian()).not.toContain("data-ekspor-url");
    expect(await bukaDaftar()).not.toContain("data-ekspor-url");
  });
});
