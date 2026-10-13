import { existsSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatGudangUji, buatTokoUji, hapusGudangUji, idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanJadwalTokoGudang, { generateMetadata } from "./[id]/page";
import HalamanDaftarJadwalToko from "./page";

// T112 (PRD A5 ▶ Revisi 2026-10-13): halaman admin Data Master › Jadwal toko. Hanya admin; pengguna lain mendapat 404
// (DESIGN §11.7). Halaman Salin jadwal operator dihapus.

let pusat: number;
let cibubur: number;
let nonaktif: { id: number; nama: string };

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
  cibubur = await idGudangUji("Gudang Cibubur");
  nonaktif = await buatGudangUji({ aktif: false });
});

afterAll(async () => {
  await hapusGudangUji(nonaktif.id);
});

beforeEach(() => {
  kepala.cookie = "";
});

const bukaDaftar = async () => renderToStaticMarkup(await HalamanDaftarJadwalToko());
const bukaGudang = async (id: number | string) =>
  renderToStaticMarkup(await HalamanJadwalTokoGudang({ params: Promise.resolve({ id: String(id) }) }));
const judulTab = async (id: number) => (await generateMetadata({ params: Promise.resolve({ id: String(id) }) })).title;
const judulHalaman = (html: string) => /<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1]?.replace(/<!-- -->/g, "");
const ditolak404 = { digest: expect.stringContaining("404") };

async function masukAdmin() {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
}

describe("/admin/jadwal-toko: admin", () => {
  it("daftar gudang aktif, masing-masing menaut ke halaman gudang itu; gudang nonaktif tidak tampil", async () => {
    await masukAdmin();
    const html = await bukaDaftar();
    expect(judulHalaman(html)).toBe("Jadwal toko");
    const kartu = [...html.matchAll(/<a [^>]*href="\/admin\/jadwal-toko\/(\d+)"/g)].map((m) => Number(m[1]));
    expect(kartu).toEqual(expect.arrayContaining([pusat, cibubur]));
    expect(kartu).not.toContain(nonaktif.id);
    expect(html).toContain("Gudang Cibubur");
  });

  for (const nama of ["Gudang Cibubur", "Pusat"] as const) {
    it(`${nama}: tabel toko terhubung beserta jadwal tetap dan tombol Atur jadwal per toko`, async () => {
      const idGudang = nama === "Pusat" ? pusat : cibubur;
      const admin = await kepalaPenggunaUji("admin");
      kepala.cookie = admin.cookie;
      const [berjadwal, kosong] = [await buatTokoUji(), await buatTokoUji()];
      await db.insert(hubunganTokoGudang).values([berjadwal, kosong].map((t) => ({ tokoId: t.id, gudangId: idGudang })));
      await db.insert(jadwalToko).values({
        tokoId: berjadwal.id,
        pola: "dua-mingguan",
        hariKirim: [{ hari: "Rabu", persiapanHari: 1 }],
        tanggalJangkar: "2026-10-14",
        dibuatOleh: admin.id,
      });

      const html = await bukaGudang(idGudang);
      expect(judulHalaman(html)).toBe(`Jadwal toko — ${nama}`);
      expect(await judulTab(idGudang)).toBe(`Jadwal toko — ${nama} — Dashboard Penjualan MANDALIKA`);
      expect(html).toContain('aria-label="Jadwal tetap per toko"');

      const baris = new RegExp(`<tr[^>]*data-jadwal-toko="${berjadwal.id}".*?</tr>`).exec(html)?.[0] ?? "";
      expect(baris).toContain(berjadwal.nama);
      expect(baris).toContain("Dua mingguan");
      expect(baris).toContain("Rabu (H−1)");
      expect(baris).toContain("Rabu, 14-10-2026");
      expect(baris).toContain("Uji admin");
      expect(baris).toContain(`aria-label="Atur jadwal ${berjadwal.nama}"`);
      expect(new RegExp(`<tr[^>]*data-jadwal-toko="${kosong.id}".*?</tr>`).exec(html)?.[0]).toContain("Belum ada jadwal");
      expect(html).toContain("Salin jadwal ke beberapa toko");
    });
  }

  it("id gudang tidak dikenal → 404", async () => {
    await masukAdmin();
    await expect(bukaGudang("999999999")).rejects.toMatchObject(ditolak404);
    await expect(bukaGudang("abc")).rejects.toMatchObject(ditolak404);
  });
});

describe("/admin/jadwal-toko: non-admin mendapat 404", () => {
  it("operator berhak jadwal Pusat dan viewer → 404 di daftar, halaman gudang, dan judul tab", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: pusat, hakTindakan: ["kelola-usulan-jadwal"] });
    const viewer = await kepalaPenggunaUji("viewer");
    for (const cookie of [operator.cookie, viewer.cookie]) {
      kepala.cookie = cookie;
      await expect(bukaDaftar()).rejects.toMatchObject(ditolak404);
      await expect(bukaGudang(pusat)).rejects.toMatchObject(ditolak404);
      await expect(judulTab(pusat)).rejects.toMatchObject(ditolak404);
    }
  });
});

describe("halaman Salin jadwal operator dihapus", () => {
  it("rute /salin-jadwal dan /salin-jadwal/[id] tidak ada lagi (Next.js menjawab 404)", () => {
    const app = join(import.meta.dirname, "..", "..");
    expect(existsSync(join(app, "salin-jadwal"))).toBe(false);
  });
});
