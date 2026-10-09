import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import golden from "../../../tests/golden/laporan-15GL-GOR-PMS-juni.json";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUji, type ProdukUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";

const kepala = vi.hoisted(() => ({ cookie: "" }));
// PRD C1: membuka halaman tidak menghitung laporan bertahap dari data harian; hanya tahap 3 dari cache.
const pantau = vi.hoisted(() => ({ hitungLaporan: 0 }));
vi.mock("@/domain/laporan", async (asli) => {
  const modul = await asli<typeof import("@/domain/laporan")>();
  return {
    ...modul,
    hitungLaporan: (...argumen: Parameters<typeof modul.hitungLaporan>) => {
      pantau.hitungLaporan += 1;
      return modul.hitungLaporan(...argumen);
    },
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanRingkasan from "./page";

beforeAll(async () => {
  await pastikanBucket();
});

beforeEach(() => {
  kepala.cookie = "";
});

const NAMA_SHEET = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

async function imporAktif({
  idAdmin,
  toko,
  tahun,
  bulan,
  hari,
  produk,
}: {
  idAdmin: string;
  toko: string;
  tahun: number;
  bulan: number;
  hari: (number | string)[];
  produk: ProdukUji[];
}) {
  const namaSheet = `${NAMA_SHEET[bulan - 1]} (S)`;
  const isi = buatWorkbookUji({ [namaSheet]: sheetPenjualanUji({ toko, bulan, hari, produk }) });
  const idImpor = await imporUji({ isi, namaSheet, tahunImpor: tahun, bulanImpor: bulan, idPengguna: idAdmin });
  expect(await aktifkanImpor(idImpor, idAdmin)).toEqual({ keadaan: "berhasil" });
}

const produkUji = (kode: string, kuantitas: (number | null)[]): ProdukUji => ({
  kode,
  nama: "15ML GLITTER - GORGEOUS",
  ukuran: "15ML",
  kategori: "15ML GLITTER/LEATHER",
  kuantitas,
});

async function buka(peran: "admin" | "viewer", parameter: Record<string, string | string[]>) {
  kepala.cookie = (await kepalaPenggunaUji(peran)).cookie;
  pantau.hitungLaporan = 0;
  const html = renderToStaticMarkup(await HalamanRingkasan({ searchParams: Promise.resolve(parameter) }));
  expect(pantau.hitungLaporan).toBe(0);
  return html;
}

/** Sel-sel satu baris tabel (toko|kode produk). */
function baris(html: string, namaToko: string, kode: string) {
  const tr = new RegExp(`<tr[^>]*data-baris="${namaToko}\\|${kode}"[^>]*>(.*?)</tr>`).exec(html)?.[1];
  if (tr === undefined) throw new Error(`Baris ${namaToko}|${kode} tidak ada.`);
  const kategori = Object.fromEntries(
    [...tr.matchAll(/<td[^>]*data-kategori="([^"]+)"([^>]*)>(.*?)<\/td>/g)].map(([, nama, atribut, isi]) => [
      nama,
      {
        nilai: /data-nilai="(\d+)"/.exec(atribut)?.[1],
        pembagi: /data-pembagi="(\d+)"/.exec(atribut)?.[1],
        tersedia: !atribut.includes('data-tersedia="tidak"'),
        isi,
      },
    ]),
  );
  const totalMentah = /data-total-mentah="(\d+)"/.exec(tr)?.[1];
  return { tr, kategori, totalMentah };
}

describe("/ringkasan: akses", () => {
  it("pengguna belum masuk diarahkan ke halaman masuk", async () => {
    await expect(HalamanRingkasan({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });
});

describe("/ringkasan: golden 15GL-GOR PMS Juni", () => {
  it("baris tabel menampilkan Senin–Kamis 1, Jumat 0, Sabtu 1, Minggu 0 (OD-09)", async () => {
    const admin = await buatPenggunaUji("admin");
    const toko = await buatTokoUji();
    const kode = kodeProdukUji();
    const perHari = new Map(golden.pengamatan.filter((p) => p.jenis === "terisi").map((p) => [Number(p.tanggal.slice(8)), p.qty]));
    await imporAktif({
      idAdmin: admin.id,
      toko: toko.nama,
      tahun: golden.tahunImpor,
      bulan: golden.bulanImpor,
      hari: [...Array.from({ length: 30 }, (_, i) => i + 1), "31/6"],
      produk: [produkUji(kode, [...Array.from({ length: 30 }, (_, i) => perHari.get(i + 1) ?? null), null])],
    });
    await hitungUlangCacheLaporan();

    const html = await buka("admin", { bulan: "2026-06" });
    expect(html).toContain('data-periode-aktif="2026-06"');
    expect(html).toContain("Juni 2026 (1 bulan)");
    expect(html).toContain('data-status-cache="terbaru"');

    const { kategori, totalMentah } = baris(html, toko.nama, kode);
    expect(Object.fromEntries(Object.entries(kategori).map(([nama, k]) => [nama, k.nilai]))).toEqual({
      "Senin–Kamis": "1",
      Jumat: "0",
      Sabtu: "1",
      Minggu: "0",
    });
    // Nol teramati tampil 0, bukan "—".
    expect(kategori.Jumat.isi).toContain(">0<");
    expect(Object.values(kategori).every((k) => k.pembagi === "1")).toBe(true);
    expect(totalMentah).toBe(String(golden.harapan.totalPenjualanMentahJuni));
    // DESIGN §8: label rata-rata dan total mentah berbeda.
    expect(html).toContain("Rata-rata Senin–Kamis");
    expect(html).toContain("Total penjualan mentah");

    // Juni–Juli: Senin–Kamis parsial karena Juli M1 hanya 29–30 Juni yang teramati (OD-08); ikon + teks.
    const juniJuli = baris(await buka("viewer", { bulan: ["2026-07", "2026-06"] }), toko.nama, kode);
    expect(juniJuli.tr).toMatch(/data-kategori="Senin–Kamis"[^>]*data-pembagi="2"[^>]*data-kelengkapan="parsial"/);
    expect(juniJuli.kategori["Senin–Kamis"].isi).toContain('data-status="parsial"');
    expect(juniJuli.kategori["Senin–Kamis"].isi).toMatch(/<svg[^>]*>.*Parsial/);
  });
});

describe("/ringkasan: bulan tidak berurutan", () => {
  it("Maret dan Juni yang keduanya punya hasil → pembagi 2; kategori tanpa pengamatan tampil —", async () => {
    // 2027: 6 Maret dan 5 Juni adalah Sabtu. Sabtu Maret = 2, Sabtu Juni = 3 → Σ 5 ÷ 2 bulan → dibulatkan ke atas 3.
    const admin = await buatPenggunaUji("admin");
    const toko = await buatTokoUji();
    const kode = kodeProdukUji();
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun: 2027, bulan: 3, hari: [6], produk: [produkUji(kode, [2])] });
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun: 2027, bulan: 6, hari: [5], produk: [produkUji(kode, [3])] });
    await hitungUlangCacheLaporan();

    const html = await buka("admin", { bulan: ["2027-06", "2027-03"] });
    expect(html).toContain("Maret 2027, Juni 2027 (2 bulan)");
    const { kategori, totalMentah } = baris(html, toko.nama, kode);
    expect(kategori.Sabtu).toMatchObject({ nilai: "3", pembagi: "2", tersedia: true });
    expect(kategori.Sabtu.isi).toContain("Σ 5 ÷ 2 bulan");
    for (const nama of ["Senin–Kamis", "Jumat", "Minggu"]) {
      expect(kategori[nama]).toMatchObject({ tersedia: false, nilai: undefined });
      // DESIGN §7: ikon CircleDashed + "—", bukan 0.
      expect(kategori[nama].isi).toMatch(/data-status="tidakTersedia".*<svg[^>]*lucide-circle-dashed[^>]*>.*—/);
      expect(kategori[nama].isi).toContain("Tidak tersedia");
    }
    expect(totalMentah).toBe("5");

    // Hanya Maret yang diterapkan: pembagi 1.
    const hanyaMaret = baris(await buka("admin", { bulan: "2027-03" }), toko.nama, kode);
    expect(hanyaMaret.kategori.Sabtu).toMatchObject({ nilai: "2", pembagi: "1" });
    expect(hanyaMaret.totalMentah).toBe("2");
  });
});

describe("/ringkasan: viewer, pagination, dan pilihan", () => {
  it("viewer (tanpa penugasan gudang) membuka halaman dan melihat semua toko (OD-07)", async () => {
    const admin = await buatPenggunaUji("admin");
    const tahun = tahunUji();
    const [tokoA, tokoB] = [await buatTokoUji(), await buatTokoUji()];
    const [kodeA, kodeB] = [kodeProdukUji(), kodeProdukUji()];
    await imporAktif({ idAdmin: admin.id, toko: tokoA.nama, tahun, bulan: 4, hari: [1, 2], produk: [produkUji(kodeA, [1, 2])] });
    await imporAktif({ idAdmin: admin.id, toko: tokoB.nama, tahun, bulan: 5, hari: [1, 2], produk: [produkUji(kodeB, [3, null])] });
    await hitungUlangCacheLaporan();

    const html = await buka("viewer", { bulan: [`${tahun}-04`, `${tahun}-05`] });
    expect(baris(html, tokoA.nama, kodeA).totalMentah).toBe("3");
    expect(baris(html, tokoB.nama, kodeB).totalMentah).toBe("3");
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("pagination di server: 51 pasangan → 50 baris di halaman 1, 1 baris di halaman 2", async () => {
    const admin = await buatPenggunaUji("admin");
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const produk = Array.from({ length: 51 }, () => produkUji(kodeProdukUji(), [1]));
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun, bulan: 8, hari: [3], produk });
    await hitungUlangCacheLaporan();

    const hitungBaris = (html: string) => html.match(/<tr[^>]*data-baris=/g)?.length ?? 0;
    const halaman1 = await buka("viewer", { bulan: `${tahun}-08` });
    expect(hitungBaris(halaman1)).toBe(50);
    expect(halaman1).toContain("Halaman 1 dari 2");
    expect(halaman1).toContain(`href="/ringkasan?bulan=${tahun}-08&amp;halaman=2"`);
    const halaman2 = await buka("viewer", { bulan: `${tahun}-08`, halaman: "2" });
    expect(hitungBaris(halaman2)).toBe(1);
    expect(halaman2).toContain("Halaman 2 dari 2");
  });

  it("tanpa pilihan di URL: belum ada periode yang diterapkan dan tabel tidak tampil", async () => {
    const html = await buka("viewer", {});
    expect(html).toContain("Belum ada periode yang diterapkan");
    expect(html).not.toContain("data-baris=");
    expect(html).toContain("Terapkan");
  });

  it("bulan di URL yang tidak tersedia di data ditolak dengan pesan", async () => {
    const html = await buka("viewer", { bulan: "1999-01" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("tidak tersedia di data");
    expect(html).not.toContain("data-baris=");
  });
});

describe("/ringkasan: filter toko, kategori produk, dan produk (T35)", () => {
  /**
   * April: toko A menjual k1 (kategori X) dan k2 (kategori Y). Mei: toko B menjual k1 (X) dan k3 (X).
   * Kategori acak per test agar data test lain di cache yang sama tidak ikut tersaring.
   */
  async function siapkan() {
    const admin = await buatPenggunaUji("admin");
    const tahun = tahunUji();
    const [tokoA, tokoB] = [await buatTokoUji(), await buatTokoUji()];
    const [k1, k2, k3] = [kodeProdukUji(), kodeProdukUji(), kodeProdukUji()];
    const [x, y] = [`KAT X ${k1}`, `KAT Y ${k2}`];
    const produkKategori = (kode: string, kategori: string, kuantitas: number[]): ProdukUji => ({
      ...produkUji(kode, kuantitas),
      nama: `PRODUK ${kode}`,
      kategori,
    });
    await imporAktif({
      idAdmin: admin.id,
      toko: tokoA.nama,
      tahun,
      bulan: 4,
      hari: [1, 2],
      produk: [produkKategori(k1, x, [1, 2]), produkKategori(k2, y, [3, 4])],
    });
    await imporAktif({
      idAdmin: admin.id,
      toko: tokoB.nama,
      tahun,
      bulan: 5,
      hari: [1, 2],
      produk: [produkKategori(k1, x, [5, 6]), produkKategori(k3, x, [7, 8])],
    });
    await hitungUlangCacheLaporan();
    return { tahun, tokoA, tokoB, k1, k2, k3, x, y, bulan: [`${tahun}-04`, `${tahun}-05`] };
  }
  const daftarBaris = (html: string) => [...html.matchAll(/<tr[^>]*data-baris="([^"]+)"/g)].map(([, b]) => b).sort();
  const jumlahBaris = (html: string) => /data-jumlah-baris="(\d+)"/.exec(html)?.[1];

  it("filter toko + kategori produk mengembalikan hanya baris yang cocok, dengan jumlah baris yang benar", async () => {
    const d = await siapkan();

    const tokoB = await buka("viewer", { bulan: d.bulan, toko: String(d.tokoB.id), kategoriProduk: d.x });
    expect(daftarBaris(tokoB)).toEqual([`${d.tokoB.nama}|${d.k1}`, `${d.tokoB.nama}|${d.k3}`].sort());
    expect(jumlahBaris(tokoB)).toBe("2");
    expect(baris(tokoB, d.tokoB.nama, d.k3).totalMentah).toBe("15");

    const tokoAX = await buka("viewer", { bulan: d.bulan, toko: String(d.tokoA.id), kategoriProduk: d.x });
    expect(daftarBaris(tokoAX)).toEqual([`${d.tokoA.nama}|${d.k1}`]);
    expect(jumlahBaris(tokoAX)).toBe("1");

    // Banyak pilihan: dua toko dan dua kategori → semua empat pasangan.
    const semua = await buka("viewer", {
      bulan: d.bulan,
      toko: [String(d.tokoA.id), String(d.tokoB.id)],
      kategoriProduk: [d.x, d.y],
    });
    expect(jumlahBaris(semua)).toBe("4");

    // Filter terlihat di atas tabel bersama periode aktif.
    expect(tokoB).toContain(`data-filter-toko="${d.tokoB.nama}"`);
    expect(tokoB).toContain(`data-filter-kategori-produk="${d.x}"`);
    expect(tokoB.indexOf("Periode aktif:")).toBeLessThan(tokoB.indexOf("data-baris="));
    expect(tokoB.indexOf("data-filter-toko=")).toBeLessThan(tokoB.indexOf("data-baris="));
  });

  it("filter produk (banyak pilihan) menyaring per kode produk di semua toko", async () => {
    const d = await siapkan();
    const html = await buka("viewer", { bulan: d.bulan, produk: [d.k1, d.k2] });
    expect(daftarBaris(html)).toEqual([`${d.tokoA.nama}|${d.k1}`, `${d.tokoA.nama}|${d.k2}`, `${d.tokoB.nama}|${d.k1}`].sort());
    expect(jumlahBaris(html)).toBe("3");
    expect(html).toContain(`data-filter-produk="${[d.k1, d.k2].sort().join(",")}"`);
  });

  it("tanpa filter di URL (belum Terapkan) semua baris tetap tampil; tombol kosongkan mengarah ke URL tanpa filter", async () => {
    const d = await siapkan();
    const tanpaFilter = await buka("viewer", { bulan: d.bulan });
    for (const b of [`${d.tokoA.nama}|${d.k1}`, `${d.tokoA.nama}|${d.k2}`, `${d.tokoB.nama}|${d.k1}`, `${d.tokoB.nama}|${d.k3}`]) {
      expect(daftarBaris(tanpaFilter)).toContain(b);
    }
    expect(tanpaFilter).not.toContain("Kosongkan filter");

    const terfilter = await buka("viewer", { bulan: d.bulan, toko: String(d.tokoA.id) });
    expect(terfilter).toContain(`href="/ringkasan?bulan=${d.tahun}-04&amp;bulan=${d.tahun}-05"`);
    expect(terfilter).toContain("Kosongkan filter");
  });

  it("pagination dan jumlah baris mengikuti hasil filter; tautan halaman membawa filter", async () => {
    const admin = await buatPenggunaUji("admin");
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const kategori = `KAT P ${kodeProdukUji()}`;
    const produk = [
      ...Array.from({ length: 51 }, () => ({ ...produkUji(kodeProdukUji(), [1]), kategori })),
      ...Array.from({ length: 3 }, () => produkUji(kodeProdukUji(), [1])),
    ];
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun, bulan: 9, hari: [3], produk });
    await hitungUlangCacheLaporan();

    const halaman1 = await buka("viewer", { bulan: `${tahun}-09`, kategoriProduk: kategori });
    expect(jumlahBaris(halaman1)).toBe("51");
    expect(halaman1).toContain("Halaman 1 dari 2");
    const kategoriUrl = new URLSearchParams({ kategoriProduk: kategori }).toString();
    expect(halaman1).toContain(`href="/ringkasan?bulan=${tahun}-09&amp;${kategoriUrl}&amp;halaman=2"`);
    const halaman2 = await buka("viewer", { bulan: `${tahun}-09`, kategoriProduk: kategori, halaman: "2" });
    expect(daftarBaris(halaman2)).toHaveLength(1);
  });

  it("filter di URL yang tidak ada di data ditolak dengan pesan", async () => {
    const d = await siapkan();
    const daftarParameter: Record<string, string>[] = [{ toko: "abc" }, { toko: "999999999" }, { kategoriProduk: "TIDAK ADA" }, { produk: "TIDAK-ADA" }];
    for (const parameter of daftarParameter) {
      const html = await buka("viewer", { bulan: d.bulan, ...parameter });
      expect(html).toContain('role="alert"');
      expect(html).toContain("Ada filter yang tidak tersedia di data");
      expect(html).not.toContain("data-baris=");
    }
  });
});

describe("/ringkasan: perbandingan minggu yang sama antarbulan (T36, PRD A2)", () => {
  /**
   * 2029, kategori Sabtu. Maret: 3 Mar (M1) = 1, 10 Mar (M2) = 0 (nol teramati). April: 14 Apr (M2) = 5,
   * M1 tidak punya nilai. Mei: 5 Mei (M1) = 3. `tokoLain` (opsional): toko lain yang hanya menjual di Juni 2029.
   * Semua impor diaktifkan sebelum satu kali hitung ulang cache.
   */
  async function siapkan({ denganTokoLain = false }: { denganTokoLain?: boolean } = {}) {
    const admin = await buatPenggunaUji("admin");
    const toko = await buatTokoUji();
    const kode = kodeProdukUji();
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun: 2029, bulan: 3, hari: [3, 10], produk: [produkUji(kode, [1, 0])] });
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun: 2029, bulan: 4, hari: [14], produk: [produkUji(kode, [5])] });
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun: 2029, bulan: 5, hari: [5], produk: [produkUji(kode, [3])] });
    const tokoLain = denganTokoLain ? await buatTokoUji() : null;
    if (tokoLain !== null) {
      await imporAktif({ idAdmin: admin.id, toko: tokoLain.nama, tahun: 2029, bulan: 6, hari: [2], produk: [produkUji(kodeProdukUji(), [1])] });
    }
    await hitungUlangCacheLaporan();
    return { toko, kode, tokoLain, pasangan: `${toko.id}|${kode}` };
  }

  /** Bagian perbandingan minggu sama: sel per minggu laporan dan kategori. */
  function mingguSama(html: string) {
    const bagian = /<section[^>]*id="minggu-sama"[^>]*>(.*?)<\/section>/.exec(html)?.[1];
    if (bagian === undefined) throw new Error("Bagian perbandingan minggu sama tidak ada.");
    const sel = Object.fromEntries(
      [...bagian.matchAll(/<tr[^>]*data-minggu-laporan="(\d+)"[^>]*>(.*?)<\/tr>/g)].flatMap(([, minggu, tr]) =>
        [...tr.matchAll(/<td[^>]*data-kategori="([^"]+)"([^>]*)>(.*?)<\/td>/g)].map(([, kategori, atribut, isi]) => [
          `M${minggu} ${kategori}`,
          {
            nilai: /data-nilai="(\d+)"/.exec(atribut)?.[1],
            jumlah: /data-jumlah="(\d+)"/.exec(atribut)?.[1],
            pembagi: /data-pembagi="(\d+)"/.exec(atribut)?.[1],
            bulan: /data-bulan="([^"]*)"/.exec(atribut)?.[1],
            tersedia: !atribut.includes('data-tersedia="tidak"'),
            isi,
          },
        ]),
      ),
    );
    return { bagian, sel };
  }

  it("dua bulan: Sabtu M1 Maret 1 dan Mei 3 → Σ 4 ÷ 2 bulan → 2; nol teramati tetap dihitung", async () => {
    const d = await siapkan();
    const html = await buka("viewer", { bulan: ["2029-05", "2029-03"], mingguSama: d.pasangan });
    const { bagian, sel } = mingguSama(html);

    expect(sel["M1 Sabtu"]).toMatchObject({ nilai: "2", jumlah: "4", pembagi: "2", bulan: "2029-03,2029-05", tersedia: true });
    expect(sel["M1 Sabtu"].isi).toContain("Σ 4 ÷ 2 bulan");
    expect(sel["M1 Sabtu"].isi).toContain("Maret 2029, Mei 2029");
    // Nol teramati: Σ 0 ÷ 1 bulan → 0, bukan "—".
    expect(sel["M2 Sabtu"]).toMatchObject({ nilai: "0", jumlah: "0", pembagi: "1", bulan: "2029-03", tersedia: true });
    expect(sel["M2 Sabtu"].isi).toContain(">0<");
    // Kategori tanpa nilai: ikon CircleDashed + "—" (DESIGN §7).
    for (const kategori of ["Senin–Kamis", "Jumat", "Minggu"]) {
      expect(sel[`M1 ${kategori}`]).toMatchObject({ tersedia: false, nilai: undefined });
      expect(sel[`M1 ${kategori}`].isi).toMatch(/data-status="tidakTersedia".*<svg[^>]*lucide-circle-dashed[^>]*>.*—/);
    }
    expect(bagian).toContain(d.kode);
    expect(bagian).toContain(d.toko.nama);
    expect(bagian).toContain("Rata-rata Sabtu");
    // Zona kerja (DESIGN §1): tanpa blob blur.
    expect(html).not.toContain("blur-3xl");
    // Baris produk–toko terpilih ditandai; total mentah di latar accent memakai accent-foreground (DESIGN §2).
    const { tr } = baris(html, d.toko.nama, d.kode);
    expect(html).toMatch(new RegExp(`<tr[^>]*data-baris="${d.toko.nama}\\|${d.kode}"[^>]*data-state="selected"`));
    expect(tr).toMatch(/class="[^"]*text-accent-foreground[^"]*"[^>]*data-total-mentah/);
    // DESIGN §2: semua teks sekunder di baris terpilih memakai accent-foreground (nama produk, Σ ÷ bulan, "—");
    // hanya ikon CircleDashed yang tetap muted-foreground (§7).
    const trTanpaIkon = tr.replace(/<svg[^>]*>.*?<\/svg>/g, "");
    expect(trTanpaIkon).not.toContain("text-muted-foreground");
    expect(tr).toMatch(/<svg[^>]*lucide-circle-dashed[^>]*text-muted-foreground/);
    expect(tr).toMatch(/class="block text-accent-foreground">15ML GLITTER - GORGEOUS</);
    expect(tr).toMatch(/class="text-xs text-accent-foreground">Σ/);
    expect(tr).toMatch(/class="[^"]*text-accent-foreground[^"]*" data-status="tidakTersedia"/);
    // Tautan "Minggu sama" di baris terpilih: accent-foreground (6,6 : 1 di accent), bukan primary (±3,97 : 1).
    const tautan = /<a[^>]*data-tautan-minggu-sama="[^"]*"[^>]*>/.exec(tr)?.[0] ?? "";
    expect(tautan).toContain('aria-current="true"');
    expect(tautan).toContain("text-accent-foreground");
    expect(tautan).toContain("hover:bg-accent-foreground/10");
    expect(tautan).not.toContain("text-primary");
    expect(tautan).not.toContain("hover:bg-primary/10");
    // Tidak ada sisa token berkontras rendah di atas accent pada baris terpilih (selain ikon, §7).
    expect(trTanpaIkon).not.toMatch(/text-primary|text-clay|text-warning|text-info/);
    // Baris yang tidak terpilih tetap memakai muted-foreground.
    const lain = baris(await buka("viewer", { bulan: ["2029-05", "2029-03"] }), d.toko.nama, d.kode).tr;
    expect(/<a[^>]*data-tautan-minggu-sama="[^"]*"[^>]*>/.exec(lain)?.[0]).toContain("text-primary");
    expect(lain).not.toContain("text-accent-foreground");
    expect(lain).toMatch(/class="block text-muted-foreground">15ML GLITTER - GORGEOUS</);
  });

  it("bulan tanpa nilai pada indeks minggu itu tidak menambah pembagi", async () => {
    const d = await siapkan();
    const { sel } = mingguSama(await buka("viewer", { bulan: ["2029-03", "2029-04", "2029-05"], mingguSama: d.pasangan }));
    // April tidak punya nilai Sabtu M1 → pembagi tetap 2.
    expect(sel["M1 Sabtu"]).toMatchObject({ nilai: "2", jumlah: "4", pembagi: "2", bulan: "2029-03,2029-05" });
    // M2: Maret 0 dan April 5; Mei tidak punya nilai → Σ 5 ÷ 2 bulan → 3.
    expect(sel["M2 Sabtu"]).toMatchObject({ nilai: "3", jumlah: "5", pembagi: "2", bulan: "2029-03,2029-04" });
    expect(sel["M2 Sabtu"].isi).toContain("Maret 2029, April 2029");
  });

  it("mengikuti periode yang diterapkan; tautan per baris membawa periode dan filter", async () => {
    const d = await siapkan();
    const hanyaMaret = mingguSama(await buka("viewer", { bulan: "2029-03", mingguSama: d.pasangan }));
    expect(hanyaMaret.sel["M1 Sabtu"]).toMatchObject({ nilai: "1", jumlah: "1", pembagi: "1", bulan: "2029-03" });

    // Tautan dari baris tabel membawa bulan dan filter yang diterapkan.
    const tanpaPilihan = await buka("viewer", { bulan: "2029-03", toko: String(d.toko.id) });
    expect(tanpaPilihan).not.toContain('id="minggu-sama"');
    const harapanUrl = new URLSearchParams({ bulan: "2029-03", toko: String(d.toko.id), mingguSama: d.pasangan }).toString();
    expect(tanpaPilihan).toContain(`href="/ringkasan?${harapanUrl.replaceAll("&", "&amp;")}#minggu-sama"`);
  });

  it("pasangan di luar periode atau filter yang diterapkan, atau tidak dikenal: pesan, tanpa angka", async () => {
    const d = await siapkan({ denganTokoLain: true });
    if (d.tokoLain === null) throw new Error("Toko lain belum disiapkan.");
    const daftarParameter: Record<string, string>[] = [
      { bulan: "2029-03", toko: String(d.tokoLain.id), mingguSama: d.pasangan },
      { bulan: "2029-06", mingguSama: d.pasangan },
      { bulan: "2029-03", mingguSama: "bukan-pasangan" },
    ];
    for (const parameter of daftarParameter) {
      const html = await buka("viewer", parameter);
      const { bagian } = mingguSama(html);
      expect(bagian).toContain('role="alert"');
      expect(bagian).toContain("tidak ada pada periode dan filter yang diterapkan");
      expect(bagian).not.toContain("data-minggu-laporan=");
    }
  });
});
