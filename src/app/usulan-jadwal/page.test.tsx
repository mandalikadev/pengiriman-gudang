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

import HalamanSalinJadwal from "../salin-jadwal/[id]/page";
import HalamanDaftarSalinJadwal from "../salin-jadwal/page";
import HalamanUsulanJadwal from "./[id]/page";
import HalamanDaftarUsulanJadwal from "./page";

// T98 — DESIGN §6 ▶ Keputusan (2026-10-13, pemilik): Usulkan jadwal toko dan Salin jadwal punya halaman sendiri.

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
  salin: { dasar: "/salin-jadwal", daftar: HalamanDaftarSalinJadwal, gudang: HalamanSalinJadwal },
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

for (const jenis of ["usulan", "salin"] as const) {
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
    // Form salin ada di halamannya sendiri: hanya form satu toko di halaman ini.
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

describe("/salin-jadwal/[id]: judul dan form mengikuti jalur", () => {
  it("gudang Pusat: judul \"Salin jadwal ke beberapa toko — Pusat\", form salin yang langsung berlaku", async () => {
    const [a, b] = [await tokoDi(pusat), await tokoDi(pusat)];
    await masukOperator([pusat, ["kelola-usulan-jadwal"]]);

    const html = await bukaGudang("salin", pusat);
    expect(judulHalaman(html)).toBe("Salin jadwal ke beberapa toko — Pusat");
    const salin = /<form[^>]*data-salin-jadwal.*?<\/form>/.exec(html)?.[0] ?? "";
    expect(salin).toContain("Pengaturan yang sama langsung menjadi jadwal aktif setiap toko terpilih.");
    expect(salin).toMatch(new RegExp(`type="checkbox"[^>]*value="${a.id}"`));
    expect(salin).toMatch(new RegExp(`type="checkbox"[^>]*value="${b.id}"`));
    expect(salin).toContain("Terapkan ke toko terpilih");
    expect(html).toContain('aria-label="Jadwal aktif per toko"');
    // Form satu toko ada di halamannya sendiri: hanya form salin di halaman ini.
    expect(html.match(/<form\b/g)).toHaveLength(1);
  });

  it("gudang selain Pusat: form salin mengirim usulan per toko", async () => {
    const t = await tokoDi(cibubur);
    await masukOperator([cibubur, ["kelola-usulan-jadwal"]]);

    const html = await bukaGudang("salin", cibubur);
    expect(judulHalaman(html)).toBe("Salin jadwal ke beberapa toko — Gudang Cibubur");
    const salin = /<form[^>]*data-salin-jadwal.*?<\/form>/.exec(html)?.[0] ?? "";
    expect(salin).toContain("Setiap toko terpilih mendapat usulan tersendiri yang disetujui atau ditolak admin.");
    expect(salin).toContain(t.nama);
    expect(salin).toContain("Kirim usulan ke toko terpilih");
    expect(html).toContain("Usulan terakhir");
    expect(html.match(/<form\b/g)).toHaveLength(1);
  });
});
