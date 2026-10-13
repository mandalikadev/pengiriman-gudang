import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang } from "@/server/db/schema";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { usulkanJadwalToko } from "@/server/gudang/usulan-jadwal";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanUsulanJadwal, { generateMetadata as metadataUsulanJadwal } from "./[id]/page";
import HalamanDaftarUsulanJadwal from "./page";

// T98 — DESIGN §6 ▶ Keputusan (2026-10-13, pemilik): Usulkan jadwal toko punya halaman sendiri. Halaman Salin jadwal
// operator dihapus (T112); salin jadwal menjadi alat admin di halaman Jadwal toko.

let pusat: number;
let bali: number;
let cibubur: number;

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
  bali = await idGudangUji("Gudang Bali");
  cibubur = await idGudangUji("Gudang Cibubur");
});

beforeEach(() => {
  kepala.cookie = "";
});

/** Masuk sebagai operator dengan penugasan `[idGudang, hak][]`. */
async function masukOperator(...penugasan: [number, HakTindakan[]][]) {
  const operator = await kepalaPenggunaUji("viewer");
  for (const [idGudang, hakTindakan] of penugasan) await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
  return operator;
}

async function tokoDi(idGudang: number) {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: idGudang });
  return t;
}

const rute = {
  usulan: { dasar: "/usulan-jadwal", daftar: HalamanDaftarUsulanJadwal, gudang: HalamanUsulanJadwal },
} as const;

const bukaGudang = async (jenis: keyof typeof rute, id: number | string) =>
  renderToStaticMarkup(await rute[jenis].gudang({ params: Promise.resolve({ id: String(id) }) }));

const bukaDaftar = async (jenis: keyof typeof rute) => renderToStaticMarkup(await rute[jenis].daftar());

/** Tautan kartu gudang di daftar: [id, nama]. */
function kartuGudang(html: string, dasar: string) {
  return [...html.matchAll(new RegExp(`<a [^>]*href="${dasar}/(\\d+)"[^>]*>(.*?)</a>`, "g"))].map((m) => ({
    id: Number(m[1]),
    teks: m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));
}

const judulHalaman = (html: string) => /<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1]?.replace(/<!-- -->/g, "");

for (const jenis of ["usulan"] as const) {
  const { dasar } = rute[jenis];

  describe(`${dasar}: daftar gudang`, () => {
    it("belum masuk → diarahkan ke halaman masuk", async () => {
      await expect(rute[jenis].daftar()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    });

    it("hak kelola-usulan-jadwal di satu gudang → langsung diarahkan ke gudang itu", async () => {
      await masukOperator([bali, ["kelola-usulan-jadwal"]], [cibubur, ["input-stok"]]);
      await expect(rute[jenis].daftar()).rejects.toMatchObject({ digest: expect.stringContaining(`${dasar}/${bali};`) });
    });

    it("hak di dua gudang → daftar dua gudang itu saja", async () => {
      await masukOperator([pusat, ["kelola-usulan-jadwal"]], [bali, ["finalisasi"]], [cibubur, ["kelola-usulan-jadwal", "input-stok"]]);
      const html = await bukaDaftar(jenis);
      expect(kartuGudang(html, dasar)).toEqual([
        { id: pusat, teks: "Pusat" },
        { id: cibubur, teks: "Gudang Cibubur" },
      ]);
      // Zona kerja: judul halaman text-2xl md:text-3xl.
      expect(html).toContain("text-2xl font-bold md:text-3xl");
    });

    it("tanpa hak kelola-usulan-jadwal di gudang mana pun → 404 (termasuk admin tanpa penugasan dan viewer)", async () => {
      for (const cookie of [
        (await masukOperator([bali, ["input-stok", "hitung-kebutuhan", "finalisasi", "ekspor"]])).cookie,
        (await kepalaPenggunaUji("admin")).cookie,
        (await kepalaPenggunaUji("viewer")).cookie,
      ]) {
        kepala.cookie = cookie;
        await expect(rute[jenis].daftar()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      }
    });
  });

  describe(`${dasar}/[id]: kewenangan`, () => {
    it("belum masuk → diarahkan ke halaman masuk", async () => {
      await expect(bukaGudang(jenis, bali)).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    });

    it("tanpa hak kelola-usulan-jadwal di gudang itu → 404, walaupun berhak di gudang lain", async () => {
      await masukOperator([bali, ["kelola-usulan-jadwal"]], [cibubur, ["input-stok"]]);
      await expect(bukaGudang(jenis, cibubur)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      await expect(bukaGudang(jenis, pusat)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    });

    it("admin tanpa penugasan → 404", async () => {
      kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
      await expect(bukaGudang(jenis, pusat)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    });

    it("id gudang tidak dikenal atau bukan angka → 404", async () => {
      await masukOperator([bali, ["kelola-usulan-jadwal"]]);
      for (const id of ["999999", "abc"]) {
        await expect(bukaGudang(jenis, id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      }
    });

    it("tautan kembali ke daftar gudang", async () => {
      await tokoDi(bali);
      await masukOperator([bali, ["kelola-usulan-jadwal"]]);
      expect(await bukaGudang(jenis, bali)).toMatch(new RegExp(`<a [^>]*href="${dasar}"[^>]*>.*?Daftar gudang</a>`));
    });
  });
}

const barisJadwal = (html: string, idToko: number) =>
  new RegExp(`<tr[^>]*data-jadwal-toko="${idToko}".*?</tr>`).exec(html)?.[0] ?? "";

describe("/usulan-jadwal/[id]: judul dan form mengikuti jalur", () => {
  it("gudang Pusat: \"Atur jadwal toko — Pusat\", form Atur jadwal toko, tabel jadwal aktif tanpa kolom usulan", async () => {
    const t = await tokoDi(pusat);
    await masukOperator([pusat, ["kelola-usulan-jadwal"]]);

    const html = await bukaGudang("usulan", pusat);
    expect(judulHalaman(html)).toBe("Atur jadwal toko — Pusat");
    expect(html).toMatch(/<form\b/);
    expect(html).toContain("Simpan jadwal");
    expect(html).not.toContain("Kirim usulan");
    expect(html).toContain('aria-label="Jadwal aktif per toko"');
    expect(barisJadwal(html, t.id)).toContain("Belum ada jadwal");
    expect(html).not.toContain("Usulan terakhir");
    expect(html).not.toContain("data-salin-jadwal");
    expect(html.match(/<form\b/g)).toHaveLength(1);
  });

  it("gudang selain Pusat: \"Usulkan jadwal toko — <gudang>\", form usulan, tabel dengan kolom Usulan terakhir", async () => {
    const t = await tokoDi(cibubur);
    const operator = await masukOperator([cibubur, ["kelola-usulan-jadwal"]]);
    await usulkanJadwalToko({
      idGudang: cibubur,
      idToko: t.id,
      masukan: { pola: "mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H" }], tanggalJangkar: null },
      idPengguna: operator.id,
    });

    const html = await bukaGudang("usulan", cibubur);
    expect(judulHalaman(html)).toBe("Usulkan jadwal toko — Gudang Cibubur");
    expect(html).toContain("Usulan berlaku setelah disetujui admin.");
    expect(html).toContain("Kirim usulan");
    expect(html).not.toContain("Atur jadwal toko");
    expect(html).toContain("Usulan terakhir");
    expect(barisJadwal(html, t.id)).toContain('data-status-usulan="menunggu"');
    expect(html).not.toContain("data-salin-jadwal");
  });
});

// T103 — catatan peninjau T98: judul tab mengikuti jalur, dan urutan heading tanpa lompatan.
describe("T103: judul tab /usulan-jadwal/[id]", () => {
  const judulTab = async (fungsi: typeof metadataUsulanJadwal, id: number) =>
    (await fungsi({ params: Promise.resolve({ id: String(id) }) })).title;

  it('Pusat: "Atur jadwal toko"; gudang lain: "Usulkan jadwal toko"', async () => {
    await masukOperator([pusat, ["kelola-usulan-jadwal"]], [cibubur, ["kelola-usulan-jadwal"]]);
    expect(await judulTab(metadataUsulanJadwal, pusat)).toBe("Atur jadwal toko — Pusat — Dashboard Penjualan MANDALIKA");
    expect(await judulTab(metadataUsulanJadwal, cibubur)).toBe("Usulkan jadwal toko — Gudang Cibubur — Dashboard Penjualan MANDALIKA");
  });

  it("tanpa hak di gudang itu → 404, judul tidak membocorkan nama gudang", async () => {
    await masukOperator([bali, ["kelola-usulan-jadwal"]]);
    await expect(judulTab(metadataUsulanJadwal, cibubur)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

/** Heading berurutan di HTML: [level, teks]. */
const daftarHeading = (html: string) =>
  [...html.matchAll(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/g)].map(
    (m) => [Number(m[1]), m[2]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()] as const,
  );

describe("T103: urutan heading halaman jadwal", () => {
  for (const jenis of ["usulan"] as const) {
    for (const nama of ["Pusat", "Gudang Cibubur"] as const) {
      it(`${rute[jenis].dasar}/<${nama}>: h1 lalu h2 tanpa lompatan, judul form tidak mengulang h1`, async () => {
        const idGudang = nama === "Pusat" ? pusat : cibubur;
        await tokoDi(idGudang);
        await masukOperator([idGudang, ["kelola-usulan-jadwal"]]);

        const html = await bukaGudang(jenis, idGudang);
        const heading = daftarHeading(html);
        expect(heading[0]?.[0]).toBe(1);
        const indeksH2 = heading.findIndex(([level]) => level === 2);
        expect(indeksH2).toBeGreaterThan(0);
        expect(heading.slice(0, indeksH2).filter(([level]) => level >= 3)).toEqual([]);
        // Tidak ada lompatan level di seluruh halaman.
        heading.forEach(([level], i) => {
          if (i > 0) expect(level - heading[i - 1]![0]).toBeLessThanOrEqual(1);
        });
        const h1 = heading[0]![1];
        expect(heading.slice(1).some(([, teks]) => h1.startsWith(teks))).toBe(false);
        // Form tetap bernama untuk pembaca layar: judul halaman (h1).
        const idH1 = /<h1[^>]*id="([^"]+)"/.exec(html)?.[1];
        expect(idH1).toBeTruthy();
        expect(html).toMatch(new RegExp(`<form[^>]*aria-labelledby="${idH1}"`));
      });
    }
  }
});
