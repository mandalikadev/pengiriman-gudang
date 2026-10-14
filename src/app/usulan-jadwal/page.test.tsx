import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, pengirimanDiLuarJadwal } from "@/server/db/schema";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";

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

// T98 — DESIGN §6 ▶ Keputusan (2026-10-13, pemilik): halaman ini dibuka dari sidebar. T113 — DESIGN §6 ▶ 2026-10-13 sore
// dan PRD A5 ▶ Revisi 2026-10-13: isinya pengiriman di luar jadwal (form + riwayat), bukan lagi form jadwal tetap.

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

/** Toko uji di gudang itu dengan jadwal tetap mingguan Senin (H). */
async function tokoDi(idGudang: number) {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: idGudang });
  const admin = await buatPenggunaUji("admin");
  await db.insert(jadwalToko).values({ tokoId: t.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 0 }], dibuatOleh: admin.id });
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

    // T118 (DESIGN §11.5): yang berhak di satu gudang langsung masuk, jadi tidak diberi tautan ke daftar gudang.
    it("tautan kembali ke daftar gudang hanya bila berhak di lebih dari satu gudang", async () => {
      await tokoDi(bali);
      await masukOperator([bali, ["kelola-usulan-jadwal"]], [cibubur, ["input-stok"]]);
      const satu = await bukaGudang(jenis, bali);
      expect(judulHalaman(satu)).toBe("Usulkan pengiriman di luar jadwal — Gudang Bali");
      expect(satu).not.toContain("Daftar gudang");

      await masukOperator([bali, ["kelola-usulan-jadwal"]], [cibubur, ["kelola-usulan-jadwal"]]);
      expect(await bukaGudang(jenis, bali)).toMatch(new RegExp(`<a [^>]*href="${dasar}"[^>]*>.*?Daftar gudang</a>`));
    });
  });
}

const barisPengiriman = (html: string, id: number) =>
  new RegExp(`<tr[^>]*data-pengiriman="${id}".*?</tr>`).exec(html)?.[0] ?? "";

describe("/usulan-jadwal/[id]: judul, form, dan riwayat pengiriman di luar jadwal", () => {
  it('gudang Pusat: "Atur pengiriman di luar jadwal — Pusat", tombol Simpan; operator berhak bisa membatalkan yang berlaku', async () => {
    const t = await tokoDi(pusat);
    const operator = await masukOperator([pusat, ["kelola-usulan-jadwal"]]);
    const [p] = await db
      .insert(pengirimanDiLuarJadwal)
      .values({ gudangId: pusat, tokoId: t.id, jenis: "tambahan", tanggalKirim: "2099-01-06", persiapanHari: 1, alasan: "promo", status: "berlaku", diusulkanOleh: operator.id })
      .returning();

    const html = await bukaGudang("usulan", pusat);
    expect(judulHalaman(html)).toBe("Atur pengiriman di luar jadwal — Pusat");
    expect(html).toContain("Pengiriman langsung berlaku.");
    expect(html).toContain(">Simpan</button>");
    expect(html).not.toContain("Kirim usulan");
    expect(html).toContain("<h2");
    expect(html).toContain("Riwayat pengiriman di luar jadwal");
    const baris = barisPengiriman(html, p.id);
    expect(baris).toContain('data-status-pengiriman="berlaku"');
    expect(baris).toContain("Langsung berlaku (Pusat)");
    expect(baris).toContain("Batalkan");
  });

  it('gudang selain Pusat: "Usulkan pengiriman di luar jadwal — <gudang>", Kirim usulan; Tarik hanya untuk usulan milik sendiri', async () => {
    const t = await tokoDi(cibubur);
    const lain = await buatPenggunaUji("viewer");
    const operator = await masukOperator([cibubur, ["kelola-usulan-jadwal"]]);
    const isi = { gudangId: cibubur, tokoId: t.id, jenis: "tambahan" as const, persiapanHari: 1 as const, alasan: "permintaan mendesak" };
    const [milikSendiri, milikLain] = await db
      .insert(pengirimanDiLuarJadwal)
      .values([
        { ...isi, tanggalKirim: "2099-01-06", diusulkanOleh: operator.id },
        { ...isi, tanggalKirim: "2099-01-07", diusulkanOleh: lain.id },
      ])
      .returning();

    const html = await bukaGudang("usulan", cibubur);
    expect(judulHalaman(html)).toBe("Usulkan pengiriman di luar jadwal — Gudang Cibubur");
    expect(html).toContain("Usulan berlaku setelah disetujui admin.");
    expect(html).toContain("Kirim usulan");
    // Terbaru di atas.
    expect(html.indexOf(`data-pengiriman="${milikLain.id}"`)).toBeLessThan(html.indexOf(`data-pengiriman="${milikSendiri.id}"`));
    expect(barisPengiriman(html, milikSendiri.id)).toContain("Tarik");
    expect(barisPengiriman(html, milikSendiri.id)).toContain("Selasa, 06-01-2099 (H−1)");
    expect(barisPengiriman(html, milikSendiri.id)).toContain("permintaan mendesak");
    expect(barisPengiriman(html, milikLain.id)).not.toContain("Tarik");
    expect(html).not.toContain("Batalkan");
  });
});

// T103 — catatan peninjau T98: judul tab mengikuti jalur, dan urutan heading tanpa lompatan.
describe("T103: judul tab /usulan-jadwal/[id]", () => {
  const judulTab = async (fungsi: typeof metadataUsulanJadwal, id: number) =>
    (await fungsi({ params: Promise.resolve({ id: String(id) }) })).title;

  it('Pusat: "Atur pengiriman di luar jadwal"; gudang lain: "Usulkan pengiriman di luar jadwal"', async () => {
    await masukOperator([pusat, ["kelola-usulan-jadwal"]], [cibubur, ["kelola-usulan-jadwal"]]);
    expect(await judulTab(metadataUsulanJadwal, pusat)).toBe("Atur pengiriman di luar jadwal — Pusat — Dashboard Penjualan MANDALIKA");
    expect(await judulTab(metadataUsulanJadwal, cibubur)).toBe(
      "Usulkan pengiriman di luar jadwal — Gudang Cibubur — Dashboard Penjualan MANDALIKA",
    );
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
