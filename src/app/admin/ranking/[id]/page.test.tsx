import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma } from "@/server/db/schema";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { publikasikanRanking } from "@/server/ranking/ranking";
import { rankingUji, workbookRankingUji } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanTinjauRanking from "./page";

let idAdmin: string;

beforeAll(async () => {
  await pastikanBucket();
  idAdmin = (await buatPenggunaUji("admin")).id;
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
});

const tampil = async (id: number | string) =>
  renderToStaticMarkup(await HalamanTinjauRanking({ params: Promise.resolve({ id: String(id) }) }));

/** Keluarga baru dengan satu alias = namanya (unik per test). */
async function keluargaUji(nama: string) {
  const [keluarga] = await db.insert(keluargaAroma).values({ nama }).returning();
  await db.insert(aliasKeluargaAroma).values({ keluargaId: keluarga.id, alias: nama });
  return keluarga;
}

const kode = () => randomUUID().slice(0, 8).toUpperCase();

describe("/admin/ranking/[id]", () => {
  it("belum masuk → halaman masuk; viewer → 404; ranking yang tidak ada → 404", async () => {
    const id = await rankingUji({ isi: workbookRankingUji([[1, `X ${kode()}`, 1]]), idPengguna: idAdmin });
    kepala.cookie = "";
    await expect(tampil(id)).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(tampil(id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await expect(tampil(2_000_000_000)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(tampil("abc")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("draft: baris tidak cocok, tujuh besar dengan keluarga hasil cocok, tombol Cocokkan ulang; Publikasikan dinonaktifkan dengan nama baris itu", async () => {
    const k = kode();
    const daftar = await Promise.all(Array.from({ length: 7 }, (_, i) => keluargaUji(`AROMA ${i + 1} ${k}`)));
    const asing = `ASING ${k}`;
    const id = await rankingUji({
      isi: workbookRankingUji([...daftar.map((d, i) => [i + 1, d.nama, 100 - i]), [8, asing, 5]]),
      idPengguna: idAdmin,
      bulanRanking: "2026-09",
    });

    const html = await tampil(id);
    expect(html).toContain("Tinjau ranking September 2026 versi");
    expect(html).toContain('data-status-ranking="draft"');
    expect(html).toContain('data-status="draft"');
    expect(html).toContain("Baris tidak cocok");
    expect(html).toContain(asing);
    expect(html).toContain('data-penanda="tidak-cocok"');
    expect(html).toContain('href="/admin/keluarga-aroma"');
    expect(html).toContain("Cocokkan ulang");
    expect(html).toContain('aria-label="Tujuh besar"');
    for (const d of daftar) expect(html).toContain(d.nama);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publikasikan<\/button>/);
    expect(html).toMatch(new RegExp(`data-alasan-publikasi[^>]*>.*${asing}`));
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("baris yang cocok ke keluarga aroma nonaktif → peringatan ikon + teks di barisnya; Publikasikan tetap aktif", async () => {
    const k = kode();
    const aktif = await keluargaUji(`AKTIF ${k}`);
    const [nonaktif] = await db.insert(keluargaAroma).values({ nama: `NONAKTIF ${k}`, aktif: false }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: nonaktif.id, alias: nonaktif.nama });
    const id = await rankingUji({ isi: workbookRankingUji([[1, aktif.nama, 9], [2, nonaktif.nama, 5]]), idPengguna: idAdmin });

    const html = await tampil(id);
    expect(html.match(/data-penanda="keluarga-nonaktif"/g)).toHaveLength(2); // tujuh besar + pencocokan setiap baris
    expect(html).toMatch(new RegExp(`NONAKTIF ${k}<span[^>]*data-penanda="keluarga-nonaktif"[^>]*><svg[^>]*lucide-triangle-alert[^>]*>.*?</svg>Keluarga aroma nonaktif`));
    expect(html).not.toMatch(new RegExp(`>AKTIF ${k}<span[^>]*data-penanda="keluarga-nonaktif"`));
    expect(html).toMatch(/<button[^>]*>Publikasikan<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Publikasikan<\/button>/);
  });

  it("dua baris cocok ke keluarga yang sama → bagian Keluarga aroma ganda dengan baris-barisnya; Publikasikan dinonaktifkan dengan alasannya", async () => {
    const k = kode();
    const [keluarga] = await db.insert(keluargaAroma).values({ nama: `GANDA ${k}` }).returning();
    await db.insert(aliasKeluargaAroma).values([
      { keluargaId: keluarga.id, alias: `GANDA A ${k}` },
      { keluargaId: keluarga.id, alias: `GANDA B ${k}` },
    ]);
    const id = await rankingUji({ isi: workbookRankingUji([[1, `GANDA A ${k}`, 9], [2, `GANDA B ${k}`, 5]]), idPengguna: idAdmin });

    const html = await tampil(id);
    expect(html).toContain("Keluarga aroma ganda");
    expect(html).toContain('aria-label="Keluarga aroma ganda"');
    expect(html).toMatch(/data-penanda="keluarga-ganda"[^>]*><svg[^>]*lucide-circle-x[^>]*>.*?<\/svg>Keluarga muncul di lebih dari satu baris/);
    expect(html).toContain(`RANK 1 (GANDA A ${k}), RANK 2 (GANDA B ${k})`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publikasikan<\/button>/);
    expect(html).toContain(`GANDA ${k} muncul di RANK 1 (GANDA A ${k}) dan RANK 2 (GANDA B ${k})`);
  });

  it("T120 (DESIGN §11.4): kartu Publikasikan berada setelah data yang ditinjau, bersama jumlah error dan peringatan", async () => {
    const k = kode();
    const aktif = await keluargaUji(`TINJAU ${k}`);
    const [nonaktif] = await db.insert(keluargaAroma).values({ nama: `TIDUR ${k}`, aktif: false }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: nonaktif.id, alias: nonaktif.nama });
    const id = await rankingUji({
      isi: workbookRankingUji([[1, aktif.nama, 9], [2, nonaktif.nama, 5], [3, `LAIN ${k}`, 1]]),
      idPengguna: idAdmin,
    });

    const html = await tampil(id);
    const posisiKeputusan = html.indexOf("data-keputusan-tinjau");
    expect(posisiKeputusan).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="Baris tidak cocok"')).toBeLessThan(posisiKeputusan);
    expect(html.indexOf('aria-label="Pencocokan setiap baris"')).toBeLessThan(posisiKeputusan);
    const keputusan = html.slice(posisiKeputusan);
    // 1 baris tidak cocok menahan publikasi (error); 1 baris cocok ke keluarga nonaktif (peringatan).
    expect(keputusan).toMatch(/data-ringkasan-masalah[^>]*>1 error, 1 peringatan\.</);
    expect(keputusan).toMatch(/<button[^>]*disabled=""[^>]*>Publikasikan<\/button>/);
    expect(html.slice(0, posisiKeputusan)).not.toContain(">Publikasikan</button>");
  });

  it("file dengan error validasi → daftar error (T52) dengan status Gagal; Publikasikan dinonaktifkan", async () => {
    const id = await rankingUji({ isi: workbookRankingUji([[1, `A ${kode()}`, 1], [1, `B ${kode()}`, 2]]), idPengguna: idAdmin });
    const html = await tampil(id);
    expect(html).toContain("Error validasi");
    expect(html).toContain("RANK 1 di baris 3 sudah dipakai di baris 2");
    expect(html).toContain('data-status="gagal"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publikasikan<\/button>/);
    expect(html).not.toContain("Cocokkan ulang");
    // T120: kartu Publikasikan setelah daftar error, dengan jumlah error.
    const posisiKeputusan = html.indexOf("data-keputusan-tinjau");
    expect(html.indexOf('aria-label="Error validasi"')).toBeLessThan(posisiKeputusan);
    expect(html.slice(posisiKeputusan)).toMatch(/data-ringkasan-masalah[^>]*>1 error, 0 peringatan\.</);
  });

  it("ranking yang sudah dipublikasikan → status Dipublikasikan dan siapa/kapan", async () => {
    const keluarga = await keluargaUji(`TERBIT ${kode()}`);
    const id = await rankingUji({ isi: workbookRankingUji([[1, keluarga.nama, 9]]), idPengguna: idAdmin });
    expect(await publikasikanRanking(id, idAdmin)).toEqual({ keadaan: "berhasil" });
    const html = await tampil(id);
    expect(html).toContain('data-status-ranking="dipublikasikan"');
    expect(html).toContain("Dipublikasikan");
    expect(html).toContain("sudah dipublikasikan dan sedang berlaku");
    // T120 (DESIGN §11.9, §7): ranking berlaku berstatus Aktif (success, CircleCheck), tanpa ikon error.
    expect(html).toMatch(/data-status-ranking="dipublikasikan"[^>]*><svg[^>]*lucide-circle-check[^>]*>.*?<\/svg>Aktif</);
    expect(html).toMatch(/data-alasan-publikasi[^>]*><svg[^>]*lucide-circle-check[^>]*text-success[^>]*>.*?<\/svg>Ranking ini sudah dipublikasikan/);
    expect(html).not.toContain("lucide-circle-x");
  });
});
