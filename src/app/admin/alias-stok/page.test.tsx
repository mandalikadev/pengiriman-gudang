import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasNamaStok, produk } from "@/server/db/schema";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import { HasilUnggahan } from "./hasil-unggahan";
import HalamanAliasStok from "./page";

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async (parameter: Record<string, string> = {}) =>
  renderToStaticMarkup(await HalamanAliasStok({ searchParams: Promise.resolve(parameter) }));

/** Alias di baris daftar, urut tampil. */
const aliasDiDaftar = (html: string) => [...html.matchAll(/<tr[^>]*data-alias="([^"]+)"/g)].map((m) => m[1]);

describe("/admin/alias-stok", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(buka()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404 (non-admin ditolak di server)", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(buka()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat daftar alias urut alias (alias, kode, nama produk), form tambah, tombol hapus, dan form unggah", async () => {
    const acak = randomUUID().slice(0, 8).toUpperCase();
    const kode = `UJI${acak}-GOR`;
    await db.insert(produk).values({ kode, nama: `PRODUK ${acak}`, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" });
    const admin = await kepalaPenggunaUji("admin");
    await db.insert(aliasNamaStok).values([
      { alias: `ZZ ALIAS ${acak}`, kodeProduk: kode, dibuatOleh: admin.id },
      { alias: `AA ALIAS ${acak}`, kodeProduk: kode, dibuatOleh: admin.id },
    ]);

    kepala.cookie = admin.cookie;
    // Database test dipakai bersama: cari alias uji agar tidak terdorong ke halaman lain (T119).
    const html = await buka({ cari: acak });
    expect(html).toContain("Alias nama stok");
    expect(html).toContain(`>AA ALIAS ${acak}<`);
    expect(html).toContain(`>ZZ ALIAS ${acak}<`);
    expect(html.indexOf(`AA ALIAS ${acak}`)).toBeLessThan(html.indexOf(`ZZ ALIAS ${acak}`));
    expect(html).toContain(`>${kode}<`);
    expect(html).toContain(`PRODUK ${acak}`);
    expect(html).toContain(`aria-label="Hapus alias AA ALIAS ${acak}"`);
    expect(html).toContain("Tambah alias");
    expect(html).toContain("Unggah tabel alias");
    expect(html).toContain('type="file"');
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});

describe("/admin/alias-stok: cari dan halaman 50 baris (T119)", () => {
  it("50 baris per halaman; cari alias, kode, atau nama produk; halaman 2 membawa pencarian", async () => {
    const acak = randomUUID().slice(0, 8).toUpperCase();
    const kode = `HLM${acak}-GOR`;
    await db.insert(produk).values({ kode, nama: `NAMA ${acak}`, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" });
    const admin = await kepalaPenggunaUji("admin");
    const alias = Array.from({ length: 60 }, (_, i) => `ALIAS ${acak} ${String(i + 1).padStart(2, "0")}`);
    await db.insert(aliasNamaStok).values(alias.map((a) => ({ alias: a, kodeProduk: kode, dibuatOleh: admin.id })));
    kepala.cookie = admin.cookie;

    const halaman1 = await buka({ cari: `alias ${acak}` });
    expect(aliasDiDaftar(halaman1)).toEqual(alias.slice(0, 50));
    expect(halaman1).toContain("Baris 1–50 dari 60 · Halaman 1 dari 2");
    expect(halaman1).toContain(`href="/admin/alias-stok?cari=alias+${acak}&amp;halaman=2"`);
    expect(halaman1).toMatch(new RegExp(`<form[^>]*data-kotak-cari="cari"[^>]*>.*?name="cari"[^>]*value="alias ${acak}"`));

    const halaman2 = await buka({ cari: `alias ${acak}`, halaman: "2" });
    expect(aliasDiDaftar(halaman2)).toEqual(alias.slice(50));
    expect(halaman2).toContain("Baris 51–60 dari 60 · Halaman 2 dari 2");

    // Cari kode produk atau nama produk juga menemukan aliasnya; satu alias tertentu bisa dicari langsung.
    expect(aliasDiDaftar(await buka({ cari: kode.toLowerCase() }))).toHaveLength(50);
    expect(aliasDiDaftar(await buka({ cari: `NAMA ${acak}`, halaman: "2" }))).toHaveLength(10);
    expect(aliasDiDaftar(await buka({ cari: alias[41] }))).toEqual([alias[41]]);
    expect(await buka({ cari: `TIDAK ADA ${acak}` })).toContain("Tidak ada alias yang cocok dengan pencarian ini.");
  });
});

describe("hasil unggahan tabel alias", () => {
  it("menampilkan nomor baris, alias, kode, keadaan (ikon + teks) beserta alasan, dan jumlah per keadaan", () => {
    const html = renderToStaticMarkup(
      <HasilUnggahan
        baris={[
          { nomor: 2, alias: "ALIAS BARU", kodeProduk: "PW110P-GOR", keadaan: "ditambahkan" },
          { nomor: 3, alias: "ALIAS LAMA", kodeProduk: "A10M-GOR", keadaan: "sudahAda" },
          { nomor: 4, alias: "ALIAS ASING", kodeProduk: "X-1", keadaan: "ditolak", alasan: "Kode produk X-1 tidak dikenal." },
        ]}
        jumlah={{ ditambahkan: 1, sudahAda: 1, ditolak: 1 }}
      />,
    );
    expect(html).toContain(">2<");
    expect(html).toContain(">ALIAS BARU<");
    expect(html).toContain(">PW110P-GOR<");
    expect(html).toContain('data-status="ditambahkan"');
    expect(html).toContain('data-status="sudahAda"');
    expect(html).toContain('data-status="ditolak"');
    expect(html).toContain("Kode produk X-1 tidak dikenal.");
    expect(html).toContain("1 ditambahkan");
    expect(html).toContain("1 sudah ada");
    expect(html).toContain("1 ditolak");
  });
});
