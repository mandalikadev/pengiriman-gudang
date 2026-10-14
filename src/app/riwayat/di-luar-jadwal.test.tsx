import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { pengirimanDiLuarJadwal } from "@/server/db/schema";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatGudangUji, buatTokoUji, hapusGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanRiwayat from "./page";

// T128 (PRD A5 ▶ Revisi 2026-10-14, A7 ▶ Keputusan 2026-10-14): tab "Di luar jadwal" halaman Riwayat. Hanya-baca: semua
// pengiriman di luar jadwal semua gudang dan semua status, terbaru di atas, dengan isian catatan aktivitas PRD A5 dan
// kolom Gudang. Filter gudang, toko, dan rentang tanggal kirim (tanggal kirim pengiriman itu), cari, halaman 50 baris.
// Semua pengguna yang sudah masuk boleh membukanya.

let gudangA: { id: number; nama: string };
let gudangB: { id: number; nama: string };
let tokoX: { id: number; nama: string };
let tokoY: { id: number; nama: string };
/** Id pengiriman, urut waktu diusulkan (lama → baru). */
const id = { menunggu: 0, berlaku: 0, ditolak: 0, ditarik: 0, dibatalkan: 0 };

beforeAll(async () => {
  gudangA = await buatGudangUji();
  gudangB = await buatGudangUji({ aktif: false });
  [tokoX, tokoY] = [await buatTokoUji(), await buatTokoUji()];
  const pengusul = await buatPenggunaUji("viewer");
  const admin = await buatPenggunaUji("admin");
  const waktu = (jam: number) => new Date(Date.UTC(2099, 0, 1, jam));
  const dasar = { persiapanHari: 1 as const, alasan: "permintaan mendesak", diusulkanOleh: pengusul.id };
  const [menunggu, berlaku, ditolak, ditarik, dibatalkan] = await db
    .insert(pengirimanDiLuarJadwal)
    .values([
      { ...dasar, gudangId: gudangA.id, tokoId: tokoX.id, jenis: "tambahan", tanggalKirim: "2099-03-02", status: "menunggu", diusulkanPada: waktu(1) },
      {
        ...dasar,
        gudangId: gudangA.id,
        tokoId: tokoX.id,
        jenis: "tambahan",
        tanggalKirim: "2099-03-03",
        status: "berlaku",
        diusulkanPada: waktu(2),
        diputuskanOleh: admin.id,
        diputuskanPada: waktu(3),
      },
      {
        ...dasar,
        gudangId: gudangA.id,
        tokoId: tokoY.id,
        jenis: "tambahan",
        tanggalKirim: "2099-03-04",
        status: "ditolak",
        diusulkanPada: waktu(4),
        diputuskanOleh: admin.id,
        diputuskanPada: waktu(5),
        alasanPenolakan: "stok gudang kurang",
      },
      { ...dasar, gudangId: gudangB.id, tokoId: tokoY.id, jenis: "tambahan", tanggalKirim: "2099-03-05", status: "ditarik", diusulkanPada: waktu(6), ditarikPada: waktu(7) },
      {
        ...dasar,
        gudangId: gudangB.id,
        tokoId: tokoX.id,
        jenis: "pindah",
        tanggalKirim: "2099-03-10",
        tanggalRutinDipindah: "2099-03-09",
        status: "dibatalkan",
        diusulkanPada: waktu(8),
        diputuskanOleh: admin.id,
        diputuskanPada: waktu(9),
        alasanPembatalan: "mal batal tutup",
        dibatalkanOleh: admin.id,
        dibatalkanPada: waktu(10),
      },
    ])
    .returning({ id: pengirimanDiLuarJadwal.id });
  Object.assign(id, { menunggu: menunggu.id, berlaku: berlaku.id, ditolak: ditolak.id, ditarik: ditarik.id, dibatalkan: dibatalkan.id });
}, 60_000);

afterAll(async () => {
  await hapusGudangUji(gudangA.id, gudangB.id);
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
});

const buka = async (parameter: Record<string, string> = {}) =>
  renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve({ tab: "di-luar-jadwal", ...parameter }) }));
const idDiDaftar = (html: string) => [...html.matchAll(/<tr[^>]*data-pengiriman="(\d+)"/g)].map((m) => Number(m[1]));
const baris = (html: string, idPengiriman: number) => new RegExp(`<tr[^>]*data-pengiriman="${idPengiriman}".*?</tr>`).exec(html)?.[0] ?? "";
const tabel = (html: string) => /<table.*?<\/table>/.exec(html)?.[0] ?? "";

async function masukOperator(hakTindakan: HakTindakan[]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang: gudangA.id, hakTindakan });
  kepala.cookie = operator.cookie;
}

describe("Riwayat, tab Di luar jadwal", () => {
  it("tab Di luar jadwal terpilih lewat ?tab=di-luar-jadwal; tab Rencana final tetap ada", async () => {
    const html = await buka({ gudang: String(gudangA.id) });
    const tab = /<nav aria-label="Jenis riwayat">.*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(tab).toMatch(/<a [^>]*href="\/riwayat">Rencana final<\/a>/);
    expect(tab).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/riwayat\?tab=di-luar-jadwal">Di luar jadwal<\/a>/);
    expect(html).toMatch(/<table[^>]*aria-label="Riwayat pengiriman di luar jadwal"/);
    expect(html).not.toContain("data-rencana-final=");
  });

  it("semua gudang dan semua status, terbaru di atas, dengan isian catatan aktivitas dan kolom Gudang", async () => {
    const html = await buka({ toko: String(tokoX.id) });
    expect(idDiDaftar(html)).toEqual([id.dibatalkan, id.berlaku, id.menunggu]);
    const semua = await buka({ cari: tokoY.nama });
    expect(idDiDaftar(semua)).toEqual([id.ditarik, id.ditolak]);

    expect(tabel(html)).toMatch(/<th[^>]*>Gudang<\/th>/);
    const menunggu = baris(html, id.menunggu);
    expect(menunggu).toContain('data-status-pengiriman="menunggu"');
    expect(menunggu).toContain(gudangA.nama);
    expect(menunggu).toContain(tokoX.nama);
    expect(menunggu).toContain("Tambahan");
    expect(menunggu).toContain("Senin, 02-03-2099 (H−1)");
    expect(menunggu).toContain("permintaan mendesak");
    expect(menunggu).toContain("Uji viewer");
    expect(menunggu).not.toContain('data-status="gudangNonaktif"');

    expect(baris(html, id.berlaku)).toContain('data-status-pengiriman="berlaku"');
    expect(baris(html, id.berlaku)).toContain("Uji admin");
    expect(baris(semua, id.ditolak)).toContain("Alasan penolakan: stok gudang kurang");
    expect(baris(semua, id.ditarik)).toContain("Ditarik pengusul");
    // Gudang nonaktif diberi penanda.
    expect(baris(semua, id.ditarik)).toMatch(new RegExp(`${gudangB.nama}.*?data-status="gudangNonaktif"`));
    const dibatalkan = baris(html, id.dibatalkan);
    expect(dibatalkan).toContain("Pindahan dari Senin, 09-03-2099");
    expect(dibatalkan).toContain("Selasa, 10-03-2099 (H−1)");
    expect(dibatalkan).toContain("Alasan pembatalan: mal batal tutup");
  });

  it("hanya-baca: tanpa tombol atau isian tindakan di tabel", async () => {
    const html = tabel(await buka({ toko: String(tokoX.id) }));
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Tarik");
    expect(html).not.toContain("Batalkan");
    expect(html).not.toMatch(/<th[^>]*>Tindakan<\/th>/);
  });

  it("filter gudang, toko, dan rentang tanggal kirim; nilai tidak dikenal diabaikan", async () => {
    expect(idDiDaftar(await buka({ gudang: String(gudangA.id) }))).toEqual([id.ditolak, id.berlaku, id.menunggu]);
    expect(idDiDaftar(await buka({ gudang: String(gudangB.id) }))).toEqual([id.dibatalkan, id.ditarik]);
    expect(idDiDaftar(await buka({ gudang: String(gudangA.id), toko: String(tokoX.id) }))).toEqual([id.berlaku, id.menunggu]);
    expect(idDiDaftar(await buka({ toko: String(tokoX.id), dari: "2099-03-03", sampai: "2099-03-10" }))).toEqual([id.dibatalkan, id.berlaku]);
    expect(idDiDaftar(await buka({ gudang: String(gudangA.id), dari: "2099-03-04" }))).toEqual([id.ditolak]);
    expect(idDiDaftar(await buka({ gudang: String(gudangA.id), sampai: "2099-03-02" }))).toEqual([id.menunggu]);
    expect(idDiDaftar(await buka({ toko: String(tokoX.id), dari: "bukan-tanggal", gudang: "999999999" }))).toEqual([
      id.dibatalkan,
      id.berlaku,
      id.menunggu,
    ]);
    const kosong = await buka({ gudang: String(gudangA.id), dari: "2099-04-01" });
    expect(idDiDaftar(kosong)).toEqual([]);
    expect(kosong).toContain("Tidak ada pengiriman di luar jadwal yang cocok dengan filter ini.");
  });

  it("form filter mengirim ke /riwayat dengan tab Di luar jadwal; nilai terapan terisi; tombol Terapkan", async () => {
    const html = await buka({ gudang: String(gudangA.id), dari: "2099-03-01", sampai: "2099-03-31" });
    const filter = /<form[^>]*data-filter-rencana-final.*?<\/form>/.exec(html)?.[0] ?? "";
    expect(filter).toMatch(/<form[^>]*action="\/riwayat"/);
    expect(filter).toMatch(/<input[^>]*type="hidden"[^>]*name="tab"[^>]*value="di-luar-jadwal"/);
    expect(filter).toContain(gudangA.nama);
    expect(filter).toMatch(/name="dari"[^>]*value="2099-03-01"/);
    expect(filter).toMatch(/name="sampai"[^>]*value="2099-03-31"/);
    expect(filter).toMatch(/name="cari"/);
    expect(filter).toMatch(/<button[^>]*type="submit"[^>]*>Terapkan/);
  });

  it("viewer dan operator tanpa hak tindakan melihat isi yang sama, tanpa tombol tindakan", async () => {
    for (const masuk of [
      async () => (kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie),
      async () => masukOperator([]),
      async () => masukOperator(["kelola-usulan-jadwal"]),
    ]) {
      await masuk();
      const html = await buka({ toko: String(tokoX.id) });
      expect(idDiDaftar(html)).toEqual([id.dibatalkan, id.berlaku, id.menunggu]);
      expect(tabel(html)).not.toContain("<button");
    }
  });
});
