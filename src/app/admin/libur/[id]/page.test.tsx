import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { aktifkanSnapshotLibur, muatTinjauSnapshotLibur } from "@/server/libur/aktivasi";
import { buatSnapshotUji, tahunLiburUji } from "@/server/libur/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanTinjauSnapshotLibur from "./page";

let idAdmin: string;

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
});

const tampil = async (id: number | string) =>
  renderToStaticMarkup(await HalamanTinjauSnapshotLibur({ params: Promise.resolve({ id: String(id) }) }));

const teks = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function aktifkan(id: number) {
  const tinjau = await muatTinjauSnapshotLibur(id);
  await aktifkanSnapshotLibur(id, tinjau!.versi, idAdmin);
}

describe("/admin/libur/[id]", () => {
  it("belum masuk → halaman masuk; viewer → 404; snapshot tidak ada → 404", async () => {
    kepala.cookie = "";
    await expect(tampil(1)).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(tampil(1)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await expect(tampil(2_147_483_647)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(tampil("abc")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("snapshot menunggu persetujuan: tahun, daftar tanggal, nama dan jenis, sumber, waktu, status, perbedaan, tombol Aktifkan", async () => {
    const tahun = await tahunLiburUji();
    await buatSnapshotUji(tahun, idAdmin, "aktif", [
      { tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional" },
      { tanggal: `${tahun}-03-20`, keterangan: "Idul Fitri", jenis: "libur nasional" },
      { tanggal: `${tahun}-03-23`, keterangan: "Cuti Bersama Idul Fitri", jenis: "cuti bersama" },
    ]);
    const baru = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [
      { tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional" },
      { tanggal: `${tahun}-03-23`, keterangan: "Cuti Bersama Idul Fitri", jenis: "libur nasional" },
      { tanggal: `${tahun}-12-25`, keterangan: "Natal", jenis: "libur nasional" },
    ]);

    const html = await tampil(baru.id);
    const isi = teks(html);
    expect(html).toContain(`Tinjau snapshot libur ${tahun}</h1>`);
    // Status ikon + teks (DESIGN §7).
    expect(html).toContain('data-status-snapshot="menunggu-persetujuan"');
    expect(isi).toContain("Menunggu persetujuan");
    expect(isi).toContain("Sumber uji");
    expect(isi).toMatch(/Disinkronkan \S+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB oleh Uji admin/);
    expect(isi).toContain("Persetujuan pertama Belum disetujui");

    // Daftar tanggal dengan nama dan jenis.
    const daftar = /<table[^>]*aria-label="Daftar libur"[^>]*>(.*?)<\/table>/.exec(html)?.[1] ?? "";
    expect(teks(daftar)).toContain(`Natal Libur nasional`);
    expect([...daftar.matchAll(/<tr/g)]).toHaveLength(4);

    // Perbedaan terhadap snapshot aktif.
    const perbedaan = [...html.matchAll(/<tr[^>]*data-perubahan="([^"]+)"[^>]*data-tanggal="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(perbedaan).toEqual([
      ["dihapus", `${tahun}-03-20`],
      ["berubah", `${tahun}-03-23`],
      ["ditambah", `${tahun}-12-25`],
    ]);
    expect(isi).toContain("Dihapus");
    expect(isi).toContain("Berubah");
    expect(isi).toContain("Ditambah");

    expect(html).toMatch(/<button[^>]*>Aktifkan<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Aktifkan/);
    expect(isi).toContain(`Snapshot aktif saat ini untuk tahun ${tahun} akan diarsipkan, tidak dihapus.`);

    // Zona kerja (DESIGN §1).
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("T120 (DESIGN §11.4): kartu Aktivasi berada setelah perbedaan dan daftar libur yang ditinjau", async () => {
    const tahun = await tahunLiburUji();
    const baru = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [
      { tanggal: `${tahun}-12-25`, keterangan: "Natal", jenis: "libur nasional" },
    ]);

    const html = await tampil(baru.id);
    const posisiKeputusan = html.indexOf("data-keputusan-tinjau");
    expect(posisiKeputusan).toBeGreaterThan(-1);
    expect(html.indexOf("Perbedaan terhadap snapshot aktif")).toBeLessThan(posisiKeputusan);
    expect(html.indexOf('aria-label="Daftar libur"')).toBeLessThan(posisiKeputusan);
    expect(html.slice(posisiKeputusan)).toMatch(/<button[^>]*>Aktifkan<\/button>/);
    expect(html.slice(0, posisiKeputusan)).not.toContain(">Aktifkan</button>");
  });

  it("snapshot arsip: persetujuan pertama (siapa, kapan), riwayat, dan tombol Aktifkan ulang", async () => {
    const tahun = await tahunLiburUji();
    const a = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [
      { tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional" },
    ]);
    const b = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", []);
    await aktifkan(a.id);
    await aktifkan(b.id);
    await aktifkan(a.id);
    await aktifkan(b.id);

    const html = await tampil(a.id);
    const isi = teks(html);
    expect(html).toContain('data-status="diarsipkan"');
    expect(isi).toMatch(/Persetujuan pertama \S+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB oleh Uji admin/);
    const riwayat = [...html.matchAll(/<tr[^>]*data-kejadian="([^"]+)"/g)].map((m) => m[1]);
    expect(riwayat).toEqual(["persetujuan", "aktivasi-ulang"]);
    expect(isi).toContain("Persetujuan pertama");
    expect(isi).toContain("Aktivasi ulang");
    expect(html).toMatch(/<button[^>]*>Aktifkan ulang<\/button>/);
  });

  it("snapshot aktif: tanpa perbedaan dengan dirinya, tombol nonaktif dengan alasannya", async () => {
    const tahun = await tahunLiburUji();
    const aktif = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", []);
    await aktifkan(aktif.id);

    const html = await tampil(aktif.id);
    const isi = teks(html);
    expect(html).toContain('data-status="aktif"');
    expect(isi).toContain(`Snapshot ini adalah daftar libur aktif tahun ${tahun}.`);
    expect(isi).toContain("Snapshot ini tidak berisi tanggal libur.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aktifkan<\/button>/);
    expect(isi).toContain("Snapshot ini sudah aktif.");
  });

  it("tahun tanpa snapshot aktif: semua tanggal tampil sebagai tambahan", async () => {
    const tahun = await tahunLiburUji();
    const baru = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [
      { tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional" },
    ]);
    const html = await tampil(baru.id);
    expect(teks(html)).toContain(`Belum ada snapshot aktif untuk tahun ${tahun}.`);
    expect(html).toContain(`data-perubahan="ditambah" data-tanggal="${tahun}-01-01"`);
    expect(teks(html)).not.toContain("akan diarsipkan");
  });
});
