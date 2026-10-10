import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import golden from "../../../tests/golden/kalender-minggu-laporan.json";

import { formatBulanImpor } from "@/app/admin/impor/format";
import { kisiBulan, parseTanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { batalkanPerubahanKategori, buatPerubahanKategori, revisiPerubahanKategori } from "@/server/kalender/perubahan-kategori";
import { buatSnapshotUji, tahunLiburUji } from "@/server/libur/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
// "Hari ini" dibaca dari jam server (WIB); dipatok agar test tidak bergantung pada tanggal menjalankan test.
const jam = vi.hoisted(() => ({ hariIni: "2026-05-06" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("@/app/admin/impor/format", async (asli) => {
  const modul = await asli<typeof import("@/app/admin/impor/format")>();
  return { ...modul, tanggalWib: () => jam.hariIni };
});

import HalamanKalender from "./page";

let cookieViewer = "";

beforeAll(async () => {
  cookieViewer = (await kepalaPenggunaUji("viewer")).cookie;
});

beforeEach(() => {
  kepala.cookie = cookieViewer;
  jam.hariIni = "2026-05-06";
});

async function buka(parameter: Record<string, string> = {}) {
  return renderToStaticMarkup(await HalamanKalender({ searchParams: Promise.resolve(parameter) }));
}

type Label = { dari: string; sampai: string; bulanLaporan: string; mingguLaporan: string; teks: string };

/** Label minggu laporan pada kisi, urut sesuai tampilan. */
function labelMinggu(html: string): Label[] {
  return [
    ...html.matchAll(
      /<td[^>]*data-dari="([^"]+)"[^>]*data-sampai="([^"]+)"[^>]*data-bulan-laporan="([^"]+)"[^>]*data-minggu-laporan="([^"]+)"[^>]*>(.*?)<\/td>/g,
    ),
  ].map((m) => ({ dari: m[1]!, sampai: m[2]!, bulanLaporan: m[3]!, mingguLaporan: m[4]!, teks: m[5]!.replace(/<[^>]+>/g, "") }));
}

/** Isi sel satu tanggal pada kisi. */
function sel(html: string, tanggal: string) {
  const cocok = new RegExp(`<td[^>]*data-tanggal="${tanggal}"[^>]*>(.*?)</td>`).exec(html);
  expect(cocok, `sel ${tanggal}`).not.toBeNull();
  return { tag: cocok![0].slice(0, cocok![0].indexOf(">") + 1), isi: cocok![1]!.replace(/<[^>]+>/g, " ") };
}

function detail(html: string) {
  const cocok = /<section[^>]*data-detail-tanggal="([^"]+)"[^>]*>(.*?)<\/section>/.exec(html);
  return cocok ? { tanggal: cocok[1]!, teks: cocok[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") } : null;
}

function labelBulan(kode: string) {
  return formatBulanImpor(Number(kode.slice(0, 4)), Number(kode.slice(5, 7)));
}

describe("/kalender: akses", () => {
  it("pengguna belum masuk diarahkan ke halaman masuk", async () => {
    kepala.cookie = "";
    await expect(HalamanKalender({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });

  it("viewer bisa membuka; tidak ada kontrol ubah (form, tombol, isian) untuk non-admin (PRD B1)", async () => {
    const html = await buka({ bulan: "2026-05" });
    expect(html).toContain("Kalender");
    expect(html).toContain('data-tanggal="2026-05-04"');
    expect(html).not.toMatch(/<form|<button|<input|<select|<textarea/);
    expect(html).not.toMatch(/Ubah|Simpan|Sinkron/);
  });
});

describe("/kalender: golden kalender-minggu-laporan (PRD B5)", () => {
  it.each(golden.kasus)("$tanggal ($hari): label minggu, bulan laporan, kategori dasar, dan detail", async (kasus) => {
    const html = await buka({ tanggal: kasus.tanggal });

    const label = labelMinggu(html).filter((l) => l.dari <= kasus.tanggal && kasus.tanggal <= l.sampai);
    expect(label).toHaveLength(1);
    expect(label[0]).toMatchObject({
      bulanLaporan: kasus.bulanLaporan,
      mingguLaporan: String(kasus.mingguLaporan),
      teks: `Minggu ${kasus.mingguLaporan} · ${labelBulan(kasus.bulanLaporan)}`,
    });

    expect(sel(html, kasus.tanggal).isi).toContain(kasus.kategoriDasar);

    const [tahun, bulan, hari] = kasus.tanggal.split("-");
    const d = detail(html);
    expect(d?.tanggal).toBe(kasus.tanggal);
    expect(d?.teks).toContain(`${kasus.hari}, ${hari}-${bulan}-${tahun}`);
    expect(d?.teks).toContain(`Kategori dasar ${kasus.kategoriDasar}`);
    expect(d?.teks).toContain(`Bulan laporan ${labelBulan(kasus.bulanLaporan)}`);
    expect(d?.teks).toContain(`Minggu laporan Minggu ${kasus.mingguLaporan}`);
  });

  it("format detail sesuai contoh golden: Jumat, 05-06-2026", async () => {
    expect(detail(await buka({ tanggal: "2026-06-05" }))?.teks).toContain(golden.format.contoh);
  });
});

describe("/kalender: kisi bulan", () => {
  it("baris 4–10 Mei 2026 menampilkan dua label: Minggu 1 (Senin–Kamis) dan Minggu 2 (Jumat–Minggu)", async () => {
    const label = labelMinggu(await buka({ bulan: "2026-05" }));
    const baris = label.filter((l) => l.dari >= "2026-05-04" && l.sampai <= "2026-05-10");
    expect(baris).toEqual([
      { dari: "2026-05-04", sampai: "2026-05-07", bulanLaporan: "2026-05", mingguLaporan: "1", teks: "Minggu 1 · Mei 2026" },
      { dari: "2026-05-08", sampai: "2026-05-10", bulanLaporan: "2026-05", mingguLaporan: "2", teks: "Minggu 2 · Mei 2026" },
    ]);
  });

  it("baris 27 April – 3 Mei: Senin–Kamis Minggu 5 April, Jumat–Minggu Minggu 1 Mei; label menempati kolomnya", async () => {
    const html = await buka({ bulan: "2026-05" });
    expect(labelMinggu(html).slice(0, 2)).toEqual([
      { dari: "2026-04-27", sampai: "2026-04-30", bulanLaporan: "2026-04", mingguLaporan: "5", teks: "Minggu 5 · April 2026" },
      { dari: "2026-05-01", sampai: "2026-05-03", bulanLaporan: "2026-05", mingguLaporan: "1", teks: "Minggu 1 · Mei 2026" },
    ]);
    expect(html).toMatch(/<td[^>]*colSpan="4"[^>]*data-dari="2026-04-27"/);
    expect(html).toMatch(/<td[^>]*colSpan="3"[^>]*data-dari="2026-05-01"/);
  });

  it("baris yang seluruhnya satu minggu laporan memakai satu label (29 Desember 2025 – 4 Januari 2026)", async () => {
    const label = labelMinggu(await buka({ bulan: "2025-12" })).at(-1);
    expect(label).toEqual({
      dari: "2025-12-29",
      sampai: "2026-01-04",
      bulanLaporan: "2026-01",
      mingguLaporan: "1",
      teks: "Minggu 1 · Januari 2026",
    });
  });

  it("kepala kisi Senin sampai Minggu dan judul bulan/tahun", async () => {
    const html = await buka({ bulan: "2026-05" });
    const kepalaKolom = [...html.matchAll(/<th[^>]*scope="col"[^>]*>(.*?)<\/th>/g)].map((m) => m[1]);
    expect(kepalaKolom).toEqual(["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]);
    expect(html).toMatch(/<h2[^>]*>Mei 2026<\/h2>/);
  });
});

describe("/kalender: hari ini dan navigasi", () => {
  it("tanpa parameter: bulan hari ini (WIB), hari ini ditandai dan menjadi detail", async () => {
    jam.hariIni = "2026-05-06";
    const html = await buka();
    expect(html).toMatch(/<h2[^>]*>Mei 2026<\/h2>/);
    expect([...html.matchAll(/aria-current="date"/g)]).toHaveLength(1);
    const hariIni = sel(html, "2026-05-06");
    expect(hariIni.isi).toContain("Hari ini");
    expect(hariIni.tag).toContain("ring-primary");
    expect(html).toMatch(/<a[^>]*aria-current="date"[^>]*href="\/kalender\?bulan=2026-05&amp;tanggal=2026-05-06"|<a[^>]*href="\/kalender\?bulan=2026-05&amp;tanggal=2026-05-06"[^>]*aria-current="date"/);
    expect(detail(html)?.tanggal).toBe("2026-05-06");
  });

  it("bulan lain: hari ini tidak ditandai dan detail menunggu pilihan tanggal", async () => {
    const html = await buka({ bulan: "2026-07" });
    expect(html).not.toContain('aria-current="date"');
    expect(detail(html)).toBeNull();
    expect(html).toContain("Pilih tanggal pada kalender untuk melihat detailnya.");
  });

  it("tautan navigasi bulan dan tahun, serta kembali ke bulan ini", async () => {
    const html = await buka({ bulan: "2026-01" });
    const tautan = Object.fromEntries([...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map((m) => [m[2]!.replace(/<[^>]+>/g, "").trim(), m[1]]));
    expect(tautan).toMatchObject({
      "Tahun sebelumnya": "/kalender?bulan=2025-01",
      "Bulan sebelumnya": "/kalender?bulan=2025-12",
      "Bulan ini": "/kalender",
      "Bulan berikutnya": "/kalender?bulan=2026-02",
      "Tahun berikutnya": "/kalender?bulan=2027-01",
    });
  });

  it("tanggal tanpa bulan membuka bulan tanggal itu; parameter tidak valid kembali ke bulan hari ini", async () => {
    expect(await buka({ tanggal: "2026-12-31" })).toMatch(/<h2[^>]*>Desember 2026<\/h2>/);
    const salah = await buka({ bulan: "2026-13", tanggal: "2026-02-30" });
    expect(salah).toMatch(/<h2[^>]*>Mei 2026<\/h2>/);
    expect(detail(salah)?.tanggal).toBe("2026-05-06");
  });

  it("tanggal terpilih memakai latar accent dengan teks accent-foreground (DESIGN §2)", async () => {
    const terpilih = sel(await buka({ tanggal: "2026-05-08" }), "2026-05-08").tag;
    expect(terpilih).toContain("bg-accent");
    expect(terpilih).toContain("text-accent-foreground");
  });
});

describe("/kalender: libur dari snapshot aktif (PRD B1, B3, B4)", () => {
  it("Senin yang libur tetap berkategori dasar Senin–Kamis; nama dan jenis libur tampil di kisi dan detail", async () => {
    const idAdmin = (await buatPenggunaUji("admin")).id;
    const tahun = await tahunLiburUji();
    const kisi = kisiBulan(tahun, 3);
    const senin = kisi[1]![0]!;
    const jumat = kisi[1]![4]!;
    const selasa = kisi[1]![1]!;
    await buatSnapshotUji(tahun, idAdmin, "aktif", [
      { tanggal: senin, keterangan: "Hari Raya Nyepi", jenis: "libur nasional" },
      { tanggal: jumat, keterangan: "Cuti Bersama Nyepi", jenis: "cuti bersama" },
    ]);
    // Snapshot yang belum aktif (menunggu persetujuan atau arsip) tidak tampil.
    await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [
      { tanggal: selasa, keterangan: "Libur Usulan", jenis: "libur nasional" },
    ]);
    await buatSnapshotUji(tahun, idAdmin, "diarsipkan", [{ tanggal: selasa, keterangan: "Libur Arsip", jenis: "libur nasional" }]);

    const html = await buka({ tanggal: senin });
    const selSenin = sel(html, senin);
    expect(selSenin.tag).toContain('data-kategori-dasar="Senin–Kamis"');
    expect(selSenin.isi).toContain("Senin–Kamis");
    expect(selSenin.isi).toContain("Hari Raya Nyepi");
    expect(selSenin.isi).toContain("Libur nasional");
    expect(sel(html, jumat).isi).toContain("Cuti Bersama Nyepi");
    expect(sel(html, jumat).isi).toContain("Cuti bersama");
    expect(sel(html, jumat).tag).toContain('data-kategori-dasar="Jumat"');
    expect(html).not.toContain("Libur Usulan");
    expect(html).not.toContain("Libur Arsip");

    const d = detail(html);
    expect(d?.teks).toContain("Kategori dasar Senin–Kamis");
    expect(d?.teks).toContain("Nama libur Hari Raya Nyepi");
    expect(d?.teks).toContain("Jenis libur Libur nasional");
  });

  it("tanggal tanpa libur aktif tidak menampilkan informasi libur di detail", async () => {
    const tahun = await tahunLiburUji();
    expect(detail(await buka({ tanggal: `${tahun}-03-10` }))?.teks).not.toContain("Jenis libur");
  });
});

describe("/kalender: perubahan kategori di detail tanggal (T42)", () => {
  // Tahun 2427 (bukan data uji lain) agar perubahan di sini tidak mengenai cache laporan berkas test lain.
  const tanggal = parseTanggalBisnis("2427-04-06");

  /** Isi bagian perubahan kategori, atau `null`. */
  function bagianPerubahan(html: string) {
    const cocok = /<section[^>]*data-perubahan-kategori="([^"]+)"[^>]*>(.*?)<\/section>/.exec(html);
    return cocok ? { tanggal: cocok[1]!, html: cocok[2]!, teks: cocok[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") } : null;
  }

  it("admin: perubahan aktif per cakupan (revisi terbaru) dengan status Aktif, form revisi dan batal, dan form buat", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const tokoAktif = await buatTokoUji();
    const tokoBatal = await buatTokoUji();
    const isian = { tanggal, alasan: "Event toko", idPengguna: admin.id };
    await buatPerubahanKategori({ ...isian, idToko: tokoAktif.id, kategoriBaru: "Sabtu" });
    await revisiPerubahanKategori({ ...isian, idToko: tokoAktif.id, kategoriBaru: "Jumat", alasan: "Event dimajukan" });
    await buatPerubahanKategori({ ...isian, idToko: tokoBatal.id, kategoriBaru: "Minggu" });
    await batalkanPerubahanKategori({ ...isian, idToko: tokoBatal.id, alasan: "Batal" });

    kepala.cookie = admin.cookie;
    const bagian = bagianPerubahan(await buka({ tanggal }));
    expect(bagian?.tanggal).toBe(tanggal);

    const item = [...bagian!.html.matchAll(/<li[^>]*data-perubahan-cakupan="([^"]+)"[^>]*>(.*?)<\/li>/g)];
    expect(item.map((m) => m[1])).toEqual([String(tokoAktif.id)]);
    const teksItem = item[0]![2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(teksItem).toContain(tokoAktif.nama);
    expect(teksItem).toContain("Kategori Sabtu → Jumat");
    expect(teksItem).toContain("Alasan Event dimajukan");
    expect(teksItem).toContain("Revisi 2");
    // DESIGN §7: status ikon + teks lewat BadgeStatus (T07).
    expect(item[0]![2]).toMatch(/data-status="aktif"[^>]*>.*?<svg[^>]*lucide-circle-check.*?Aktif/);
    expect(teksItem).toContain("Simpan revisi");
    expect(teksItem).toContain("Alasan pembatalan");
    expect(teksItem).toContain("Batalkan perubahan");

    expect(bagian!.teks).toContain("Buat perubahan kategori");
    expect(bagian!.teks).toContain("Seluruh toko");
    expect(bagian!.teks).toContain("Simpan perubahan");
    expect([...bagian!.html.matchAll(/<form/g)]).toHaveLength(3);
  });

  it("admin: tanggal tanpa perubahan aktif hanya menampilkan form buat", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const bagian = bagianPerubahan(await buka({ tanggal: "2427-04-07" }));
    expect(bagian?.teks).toContain("Belum ada perubahan aktif pada tanggal ini.");
    expect([...bagian!.html.matchAll(/<form/g)]).toHaveLength(1);
  });

  it("viewer: bagian perubahan kategori tidak dirender walaupun tanggal punya perubahan", async () => {
    const idAdmin = (await buatPenggunaUji("admin")).id;
    const toko = await buatTokoUji();
    await buatPerubahanKategori({ tanggal, idToko: null, kategoriBaru: "Minggu", alasan: "Seluruh", idPengguna: idAdmin });
    await buatPerubahanKategori({ tanggal, idToko: toko.id, kategoriBaru: "Minggu", alasan: "Toko", idPengguna: idAdmin });

    const html = await buka({ tanggal });
    expect(bagianPerubahan(html)).toBeNull();
    expect(html).not.toMatch(/<form|<button|<input|<select|<textarea/);
  });
});

describe("/kalender: kategori efektif sesuai cakupan toko (T43, PRD B4, B6)", () => {
  // Tahun 2427 (bukan data uji lain), tanggal berbeda dari blok T42 di atas karena database dipakai bersama satu putaran.
  const selasa = parseTanggalBisnis("2427-05-04");
  const rabu = parseTanggalBisnis("2427-05-05");
  const kamis = parseTanggalBisnis("2427-05-06");

  type Toko = { id: number; nama: string };
  let tokoA: Toko;
  let tokoB: Toko;
  let tokoNonaktif: Toko;

  beforeAll(async () => {
    const idAdmin = (await buatPenggunaUji("admin")).id;
    tokoA = await buatTokoUji();
    tokoB = await buatTokoUji();
    tokoNonaktif = await buatTokoUji({ aktif: false });
    const isian = { idPengguna: idAdmin };
    // Selasa: hanya perubahan khusus toko A.
    await buatPerubahanKategori({ ...isian, tanggal: selasa, idToko: tokoA.id, kategoriBaru: "Minggu", alasan: "Promo" });
    await revisiPerubahanKategori({ ...isian, tanggal: selasa, idToko: tokoA.id, kategoriBaru: "Sabtu", alasan: "Promo toko A" });
    // Rabu: perubahan seluruh toko, lalu toko A punya perubahan sendiri.
    await buatPerubahanKategori({ ...isian, tanggal: rabu, idToko: null, kategoriBaru: "Minggu", alasan: "Event seluruh toko" });
    await buatPerubahanKategori({ ...isian, tanggal: rabu, idToko: tokoA.id, kategoriBaru: "Jumat", alasan: "Event khusus A" });
    // Kamis: perubahan toko A yang sudah dibatalkan tidak berlaku.
    await buatPerubahanKategori({ ...isian, tanggal: kamis, idToko: tokoA.id, kategoriBaru: "Sabtu", alasan: "Batal nanti" });
    await batalkanPerubahanKategori({ ...isian, tanggal: kamis, idToko: tokoA.id, alasan: "Tidak jadi" });
  });

  const tampilan = (tanggal: string, toko?: Toko) => buka({ tanggal, ...(toko ? { toko: String(toko.id) } : {}) });

  /** Tautan pemilih cakupan: teks → { href, terpilih }. */
  function pemilihCakupan(html: string) {
    const nav = /<nav[^>]*aria-label="Cakupan toko"[^>]*>(.*?)<\/nav>/.exec(html);
    expect(nav, "pemilih cakupan").not.toBeNull();
    return Object.fromEntries(
      [...nav![1]!.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map((m) => [
        m[2]!.replace(/<[^>]+>/g, "").trim(),
        { href: /href="([^"]*)"/.exec(m[1]!)?.[1]?.replaceAll("&amp;", "&"), terpilih: m[1]!.includes('aria-current="true"') },
      ]),
    );
  }

  it("perubahan khusus toko A tampil saat melihat toko A, dan tidak tampil saat melihat toko B atau Semua toko", async () => {
    const lihatA = await tampilan(selasa, tokoA);
    const selA = sel(lihatA, selasa);
    expect(selA.tag).toContain('data-kategori-dasar="Senin–Kamis"');
    expect(selA.tag).toContain('data-kategori-efektif="Sabtu"');
    expect(selA.isi).toContain("Senin–Kamis");
    expect(selA.isi).toContain("Efektif: Sabtu");
    // Penanda perubahan: ikon + teks lewat BadgeStatus (DESIGN §7, T07).
    expect(lihatA).toMatch(new RegExp(`data-tanggal="${selasa}".*?data-status="manual"[^>]*>.*?<svg[^>]*lucide-hand.*?Manual`));
    const detailA = detail(lihatA)!.teks;
    expect(detailA).toContain("Kategori dasar Senin–Kamis");
    expect(detailA).toContain("Kategori efektif Sabtu");
    expect(detailA).toContain(`Cakupan ${tokoA.nama}`);
    expect(detailA).toContain("Alasan Promo toko A");
    expect(detailA).toContain("Revisi 2");
    expect(detailA).toMatch(/Oleh \S.*WIB/);
    expect(detailA).toContain("Status Aktif");
    expect(lihatA).toMatch(/data-detail-tanggal=.*?data-status="aktif"[^>]*>.*?<svg[^>]*lucide-circle-check.*?Aktif/);

    for (const html of [await tampilan(selasa, tokoB), await tampilan(selasa)]) {
      const s = sel(html, selasa);
      expect(s.tag).toContain('data-kategori-efektif="Senin–Kamis"');
      expect(s.isi).not.toContain("Efektif:");
      expect(s.isi).not.toContain("Manual");
      const d = detail(html)!.teks;
      expect(d).toContain("Kategori efektif Senin–Kamis");
      expect(d).not.toContain("Promo toko A");
      expect(d).not.toContain(tokoA.nama);
      expect(html).not.toContain("Promo toko A");
    }
  });

  it("urutan cakupan: toko A memakai perubahannya sendiri, toko B dan Semua toko memakai perubahan seluruh toko", async () => {
    const lihatA = await tampilan(rabu, tokoA);
    expect(sel(lihatA, rabu).tag).toContain('data-kategori-efektif="Jumat"');
    expect(detail(lihatA)!.teks).toContain("Alasan Event khusus A");

    for (const html of [await tampilan(rabu, tokoB), await tampilan(rabu)]) {
      expect(sel(html, rabu).tag).toContain('data-kategori-efektif="Minggu"');
      expect(sel(html, rabu).isi).toContain("Efektif: Minggu");
      const d = detail(html)!.teks;
      expect(d).toContain("Cakupan Seluruh toko");
      expect(d).toContain("Alasan Event seluruh toko");
      expect(d).not.toContain("Event khusus A");
    }
  });

  it("perubahan yang dibatalkan tidak menandai tanggal", async () => {
    const html = await tampilan(kamis, tokoA);
    expect(sel(html, kamis).tag).toContain('data-kategori-efektif="Senin–Kamis"');
    expect(sel(html, kamis).isi).not.toContain("Manual");
    // Sejak T71 perubahan yang dibatalkan tampil sebagai riwayat, tetapi tidak sebagai perubahan yang berlaku.
    const [berlaku, riwayat] = detail(html)!.teks.split("Riwayat perubahan dibatalkan");
    expect(berlaku).not.toContain("Batal nanti");
    expect(riwayat).toContain("Batal nanti");
  });

  it("posisi minggu dan bulan laporan tidak berubah oleh kategori efektif (PRD B6: Selasa 30-06-2026 → Jumat tetap Juli Minggu 1)", async () => {
    const idAdmin = (await buatPenggunaUji("admin")).id;
    const tokoC = await buatTokoUji();
    await buatPerubahanKategori({ tanggal: parseTanggalBisnis("2026-06-30"), idToko: tokoC.id, kategoriBaru: "Jumat", alasan: "Contoh B6", idPengguna: idAdmin });

    const html = await tampilan("2026-06-30", tokoC);
    expect(sel(html, "2026-06-30").tag).toContain('data-kategori-efektif="Jumat"');
    // Baris 29-06 s.d. 05-07: Senin–Kamis ikut Kamis 2 Juli, Jumat–Minggu 3–5 Juli; semuanya Juli Minggu 1 (PRD B5).
    const label = labelMinggu(html).filter((l) => l.dari <= "2026-06-30" && "2026-06-30" <= l.sampai);
    expect(label).toEqual([
      { dari: "2026-06-29", sampai: "2026-07-05", bulanLaporan: "2026-07", mingguLaporan: "1", teks: "Minggu 1 · Juli 2026" },
    ]);
    const d = detail(html)!.teks;
    expect(d).toContain("Kategori dasar Senin–Kamis");
    expect(d).toContain("Kategori efektif Jumat");
    expect(d).toContain("Bulan laporan Juli 2026");
    expect(d).toContain("Minggu laporan Minggu 1");
  });

  it("pemilih cakupan: Semua toko dan setiap toko aktif, sebagai tautan yang mempertahankan bulan dan tanggal", async () => {
    const html = await buka({ bulan: "2427-05", tanggal: selasa, toko: String(tokoA.id) });
    const pemilih = pemilihCakupan(html);
    expect(pemilih["Semua toko"]).toEqual({ href: `/kalender?bulan=2427-05&tanggal=${selasa}`, terpilih: false });
    expect(pemilih[tokoA.nama]).toEqual({ href: `/kalender?bulan=2427-05&tanggal=${selasa}&toko=${tokoA.id}`, terpilih: true });
    expect(pemilih[tokoB.nama]).toEqual({ href: `/kalender?bulan=2427-05&tanggal=${selasa}&toko=${tokoB.id}`, terpilih: false });
    expect(pemilih[tokoNonaktif.nama]).toBeUndefined();
    // Navigasi bulan dan pilihan tanggal tetap di cakupan yang sama.
    expect(html).toContain(`href="/kalender?bulan=2427-06&amp;toko=${tokoA.id}"`);
    expect(html).toContain(`href="/kalender?bulan=2427-05&amp;tanggal=${rabu}&amp;toko=${tokoA.id}"`);
    expect(html).not.toMatch(/<form|<button|<input|<select|<textarea/);
  });

  it("tanpa parameter atau toko tidak dikenal/nonaktif: cakupan Semua toko", async () => {
    for (const toko of [undefined, "abc", "0", String(tokoNonaktif.id)]) {
      const html = await buka({ tanggal: selasa, ...(toko ? { toko } : {}) });
      expect(pemilihCakupan(html)["Semua toko"]?.terpilih).toBe(true);
      expect(sel(html, selasa).tag).toContain('data-kategori-efektif="Senin–Kamis"');
    }
  });
});

describe("/kalender: riwayat perubahan kategori yang dibatalkan (T71, PRD B4 ▶ Keputusan 2026-10-10)", () => {
  // Tahun 2427, tanggal berbeda dari blok T42/T43 karena database dipakai bersama satu putaran.
  const senin = parseTanggalBisnis("2427-06-07");
  const selasa = parseTanggalBisnis("2427-06-08");

  type Toko = { id: number; nama: string };
  let tokoA: Toko;
  let tokoB: Toko;

  /** Admin uji dengan nama unik agar pembuat dan pembatal bisa dibedakan di tampilan. */
  async function adminBernama(nama: string) {
    const { id } = await buatPenggunaUji("admin");
    await db.update(user).set({ name: nama }).where(eq(user.id, id));
    return id;
  }

  beforeAll(async () => {
    const pembuat = await adminBernama("Pembuat Riwayat");
    const pembatal = await adminBernama("Pembatal Riwayat");
    tokoA = await buatTokoUji();
    tokoB = await buatTokoUji();
    // Senin: toko A diubah, direvisi, lalu dibatalkan; seluruh toko dibatalkan lalu dibuat lagi (aktif).
    await buatPerubahanKategori({ tanggal: senin, idToko: tokoA.id, kategoriBaru: "Sabtu", alasan: "Promo A", idPengguna: pembuat });
    await revisiPerubahanKategori({ tanggal: senin, idToko: tokoA.id, kategoriBaru: "Minggu", alasan: "Promo A diperpanjang", idPengguna: pembuat });
    await batalkanPerubahanKategori({ tanggal: senin, idToko: tokoA.id, alasan: "Promo A dibatalkan pusat", idPengguna: pembatal });
    await buatPerubahanKategori({ tanggal: senin, idToko: null, kategoriBaru: "Jumat", alasan: "Event lama", idPengguna: pembuat });
    await batalkanPerubahanKategori({ tanggal: senin, idToko: null, alasan: "Event lama ditunda", idPengguna: pembatal });
    await buatPerubahanKategori({ tanggal: senin, idToko: null, kategoriBaru: "Sabtu", alasan: "Event baru", idPengguna: pembuat });
    // Selasa: hanya perubahan toko A yang dibatalkan.
    await buatPerubahanKategori({ tanggal: selasa, idToko: tokoA.id, kategoriBaru: "Minggu", alasan: "Uji selasa", idPengguna: pembuat });
    await batalkanPerubahanKategori({ tanggal: selasa, idToko: tokoA.id, alasan: "Selasa batal", idPengguna: pembatal });
  });

  const tampilan = (tanggal: string, toko?: Toko) => buka({ tanggal, ...(toko ? { toko: String(toko.id) } : {}) });

  /** Bagian riwayat dibatalkan di detail tanggal: html dan entri (`data-riwayat-dibatalkan` = cakupan). */
  function riwayat(html: string) {
    const cocok = /<div[^>]*data-riwayat-dibatalkan-tanggal="[^"]+"[^>]*>(.*?)<\/ul><\/div>/.exec(html);
    if (!cocok) return null;
    const entri = [...cocok[1]!.matchAll(/<li[^>]*data-riwayat-dibatalkan="([^"]+)"[^>]*>(.*?)<\/li>/g)].map((m) => ({
      cakupan: m[1]!,
      html: m[2]!,
      teks: m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    }));
    return { html: cocok[1]!, teks: cocok[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), entri };
  }

  it("perubahan yang dibatalkan tampil di detail tanggal berlabel Dibatalkan (ikon + teks), terpisah dari kategori efektif", async () => {
    const html = await tampilan(senin, tokoA);
    const d = detail(html)!;
    // Kategori efektif dan perubahan aktif tetap dari perubahan seluruh toko yang aktif.
    expect(d.teks).toContain("Kategori efektif Sabtu");
    expect(d.teks).toContain("Alasan Event baru");

    const r = riwayat(html);
    expect(r, "bagian riwayat dibatalkan").not.toBeNull();
    expect(r!.teks).toContain("Riwayat perubahan dibatalkan");
    // Riwayat berada di dalam detail tanggal, sesudah kategori efektif dan perubahan aktif.
    const isiDetail = /<section[^>]*data-detail-tanggal="[^"]+"[^>]*>(.*?)<\/section>/.exec(html)![1]!;
    expect(isiDetail.indexOf("data-riwayat-dibatalkan-tanggal")).toBeGreaterThan(isiDetail.indexOf("Kategori efektif"));
    expect(isiDetail.indexOf("data-riwayat-dibatalkan-tanggal")).toBeGreaterThan(isiDetail.indexOf("Event baru"));
    expect(r!.teks).not.toContain("Event baru");

    // Toko A (revisi 1 dan 2) dan seluruh toko (revisi 1): setiap revisi yang dibatalkan adalah satu entri.
    expect(r!.entri.map((e) => e.cakupan).sort()).toEqual([String(tokoA.id), String(tokoA.id), "semua"].sort());
    for (const e of r!.entri) {
      // DESIGN §7: ikon + teks lewat BadgeStatus (T07); token muted-foreground + Archive.
      expect(e.html).toMatch(/data-status="dibatalkan"[^>]*>.*?<svg[^>]*lucide-archive.*?Dibatalkan/);
      expect(e.teks).toMatch(/Dibuat oleh Pembuat Riwayat, .* WIB/);
      expect(e.teks).toMatch(/Dibatalkan oleh Pembatal Riwayat, .* WIB/);
    }

    const revisi2 = r!.entri.find((e) => e.cakupan === String(tokoA.id) && e.teks.includes("Revisi 2"))!;
    expect(revisi2.teks).toContain(`Cakupan ${tokoA.nama}`);
    expect(revisi2.teks).toContain("Kategori Sabtu → Minggu");
    expect(revisi2.teks).toContain("Alasan perubahan Promo A diperpanjang");
    expect(revisi2.teks).toContain("Alasan pembatalan Promo A dibatalkan pusat");

    const revisi1 = r!.entri.find((e) => e.cakupan === String(tokoA.id) && e.teks.includes("Revisi 1"))!;
    expect(revisi1.teks).toContain("Kategori Senin–Kamis → Sabtu");
    expect(revisi1.teks).toContain("Alasan perubahan Promo A");

    const seluruh = r!.entri.find((e) => e.cakupan === "semua")!;
    expect(seluruh.teks).toContain("Cakupan Seluruh toko");
    expect(seluruh.teks).toContain("Kategori Senin–Kamis → Jumat");
    expect(seluruh.teks).toContain("Alasan pembatalan Event lama ditunda");

    // Hanya-baca untuk non-admin: tidak ada kontrol baru.
    expect(html).not.toMatch(/<form|<button|<input|<select|<textarea/);
  });

  it("perubahan yang dibatalkan tidak mengubah kategori efektif maupun penanda di sel kalender", async () => {
    const html = await tampilan(selasa, tokoA);
    const s = sel(html, selasa);
    expect(s.tag).toContain('data-kategori-efektif="Senin–Kamis"');
    expect(s.isi).not.toContain("Efektif:");
    expect(s.isi).not.toContain("Manual");
    expect(s.isi).not.toContain("Dibatalkan");
    const d = detail(html)!.teks;
    expect(d).toContain("Kategori efektif Senin–Kamis");
    expect(d).not.toContain("Perubahan kategori Cakupan");
    expect(riwayat(html)?.entri.map((e) => e.teks)).toEqual([expect.stringContaining("Alasan pembatalan Selasa batal")]);
  });

  it("pembatalan perubahan khusus toko A tidak tampil saat melihat toko B atau Semua toko", async () => {
    for (const html of [await tampilan(senin, tokoB), await tampilan(senin)]) {
      const r = riwayat(html);
      expect(r?.entri.map((e) => e.cakupan)).toEqual(["semua"]);
      expect(html).not.toContain("Promo A");
      // Nama toko A tetap ada di pemilih cakupan; yang diperiksa detail tanggalnya.
      expect(detail(html)!.teks).not.toContain(tokoA.nama);
    }
    for (const html of [await tampilan(selasa, tokoB), await tampilan(selasa)]) {
      expect(riwayat(html)).toBeNull();
      expect(html).not.toContain("Selasa batal");
    }
  });
});
