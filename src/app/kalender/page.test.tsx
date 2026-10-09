import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import golden from "../../../tests/golden/kalender-minggu-laporan.json";

import { formatBulanImpor } from "@/app/admin/impor/format";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";

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
