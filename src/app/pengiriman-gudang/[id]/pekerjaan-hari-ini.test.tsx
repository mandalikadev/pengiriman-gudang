import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, pengirimanDiLuarJadwal, periodeSumberGudang, versiRanking } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatGudangUji, buatTokoUji, hapusGudangUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { bacaKunciVersi } from "@/server/laporan/cache";
import { tahunRankingUjiBebas } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
// "Hari ini" dibaca dari jam server (WIB); dipatok agar test tidak bergantung pada tanggal menjalankan test.
const jam = vi.hoisted(() => ({ hariIni: "2026-10-13" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("@/app/admin/impor/format", async (asli) => {
  const modul = await asli<typeof import("@/app/admin/impor/format")>();
  return { ...modul, tanggalWib: () => jam.hariIni };
});

import HalamanPengirimanGudang from "./page";

// T118 (DESIGN §11.5; PRD A5 ▶ Revisi 2026-10-13): halaman Pengiriman Gudang langsung dibuka di pekerjaan hari ini.
// Hari ini dipatok Selasa, 13-10-2026. Gudang uji sendiri:
// - toko Kamis (H) dengan pengiriman di luar jadwal berlaku Sabtu 24-10 (dan 28-10, di luar 14 hari);
// - toko Senin (H−1) dengan usulan menunggu Sabtu 17-10 (belum berlaku, jadi bukan tanggal kirim);
// - toko nonaktif berjadwal Selasa: tidak mengirim, jadi hari ini bukan tanggal kirim terdekat.
// Tanggal kirim terdekat = Kamis, 15-10-2026.

const TERDEKAT = "2026-10-15";

let gudangUji: { id: number; nama: string };
let idAdmin: string;
let tokoNonaktif: { id: number; nama: string };

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  gudangUji = await buatGudangUji();
  const [kamis, senin] = [await buatTokoUji(), await buatTokoUji()];
  tokoNonaktif = await buatTokoUji({ aktif: false });
  await db.insert(hubunganTokoGudang).values([kamis, senin, tokoNonaktif].map((t) => ({ tokoId: t.id, gudangId: gudangUji.id })));
  await db.insert(jadwalToko).values([
    { tokoId: kamis.id, pola: "mingguan", hariKirim: [{ hari: "Kamis", persiapanHari: 0 }], dibuatOleh: idAdmin },
    { tokoId: senin.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 1 }], dibuatOleh: idAdmin },
    { tokoId: tokoNonaktif.id, pola: "mingguan", hariKirim: [{ hari: "Selasa", persiapanHari: 0 }], dibuatOleh: idAdmin },
  ]);
  const isi = { gudangId: gudangUji.id, persiapanHari: 1 as const, alasan: "uji", diusulkanOleh: idAdmin, jenis: "tambahan" as const };
  const diputuskan = { status: "berlaku" as const, diputuskanOleh: idAdmin, diputuskanPada: new Date() };
  await db.insert(pengirimanDiLuarJadwal).values([
    { ...isi, ...diputuskan, tokoId: kamis.id, tanggalKirim: "2026-10-24" },
    { ...isi, ...diputuskan, tokoId: kamis.id, tanggalKirim: "2026-10-28" },
    { ...isi, tokoId: senin.id, tanggalKirim: "2026-10-17" },
  ]);
}, 60_000);

afterAll(async () => {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, gudangUji.id));
  await hapusGudangUji(gudangUji.id);
});

beforeEach(() => {
  kepala.cookie = "";
  jam.hariIni = "2026-10-13";
});

/** Draft tersimpan langsung (tanpa menghitung, tanpa toko) untuk `tanggalKirim`; `dihitungPada` mengatur draft terakhir. */
async function buatDraftUji(tanggalKirim: string, dihitungPada: Date) {
  const [ranking] = await db
    .insert(versiRanking)
    .values({
      bulanRanking: `${await tahunRankingUjiBebas()}-09`,
      versi: 1,
      namaFile: "RANKING-UJI.xlsx",
      ukuranByte: 1,
      kunciObjek: `uji/${randomUUID()}`,
      diunggahOleh: idAdmin,
    })
    .returning({ id: versiRanking.id });
  const [periode] = await db
    .insert(periodeSumberGudang)
    .values({ gudangId: gudangUji.id, bulan: ["2026-06"], ditetapkanOleh: idAdmin })
    .returning({ id: periodeSumberGudang.id });
  const kunci = await bacaKunciVersi(db);
  await db.insert(draftRencana).values({
    gudangId: gudangUji.id,
    tanggalKirim,
    dihitungOleh: idAdmin,
    dihitungPada,
    versiPeriodeSumber: periode.id,
    revisiKalender: kunci.revisiKalender,
    versiRankingId: ranking.id,
    bulanSumber: ["2026-06"],
    imporAktif: kunci.imporAktif,
  });
}

async function masukOperator(...daftarGudang: number[]) {
  const operator = await kepalaPenggunaUji("viewer");
  for (const idGudang of daftarGudang) {
    await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan: ["hitung-kebutuhan", "kelola-usulan-jadwal"] });
  }
  kepala.cookie = operator.cookie;
}

const buka = async (parameter: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await HalamanPengirimanGudang({
      params: Promise.resolve({ id: String(gudangUji.id) }),
      searchParams: Promise.resolve(parameter),
    }),
  );

/** Chip draft tersimpan dalam urutan tampil: [tanggal, ditandai Terdekat]. */
function chipDraft(html: string) {
  const nav = /<nav aria-label="Draft tersimpan".*?<\/nav>/.exec(html)?.[0] ?? "";
  return [...nav.matchAll(/<a [^>]*href="\/pengiriman-gudang\/\d+\?tanggal=([\d-]+)"[^>]*>(.*?)<\/a>/g)].map((m) => [
    m[1],
    /data-terdekat/.test(m[0]) && m[2]!.includes("Terdekat"),
  ]);
}

describe("T118: tanggal yang dibuka pertama kali", () => {
  it("tanpa ?tanggal: tanggal kirim terdekat, bukan draft terakhir dihitung; draftnya belum ada → ajakan Hitung kebutuhan", async () => {
    await buatDraftUji("2026-10-19", new Date());
    await masukOperator(gudangUji.id);

    const html = await buka();
    expect(html).not.toContain('data-draft-tanggal="2026-10-19"');
    expect(html).toContain("Belum ada draft rencana untuk Kamis, 15-10-2026.");
    expect(html).toMatch(new RegExp(`data-ajakan-hitung="${TERDEKAT}".*?Hitung kebutuhan untuk Kamis, 15-10-2026</button>`));

    // Draft tanggal terdekat yang dihitung lebih dulu tetap dipilih walaupun draft 19-10 dihitung terakhir.
    await buatDraftUji(TERDEKAT, new Date(Date.now() - 86_400_000));
    const htmlAda = await buka();
    expect(htmlAda).toContain(`data-draft-tanggal="${TERDEKAT}"`);
    expect(htmlAda).not.toContain("data-ajakan-hitung");

    // Tanggal di URL tetap dihormati.
    const htmlUrl = await buka({ tanggal: "2026-10-19" });
    expect(htmlUrl).toContain('data-draft-tanggal="2026-10-19"');
    expect(htmlUrl).not.toContain("data-ajakan-hitung");
  });

  it("pengguna tanpa hak hitung-kebutuhan (admin) tidak mendapat ajakan, hanya keterangan", async () => {
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, gudangUji.id));
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await buka();
    expect(html).toContain("Belum ada draft rencana untuk Kamis, 15-10-2026.");
    expect(html).not.toContain("data-ajakan-hitung");
  });
});

describe("T118: chip draft tersimpan", () => {
  it("urut dari yang terdekat (yang akan datang naik, lalu yang lewat), penanda Terdekat pada tanggal kirim terdekat", async () => {
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, gudangUji.id));
    for (const tanggal of ["2026-10-22", "2026-10-01", "2026-10-19", TERDEKAT, "2026-10-08"]) await buatDraftUji(tanggal, new Date());
    await masukOperator(gudangUji.id);

    expect(chipDraft(await buka())).toEqual([
      [TERDEKAT, true],
      ["2026-10-19", false],
      ["2026-10-22", false],
      ["2026-10-08", false],
      ["2026-10-01", false],
    ]);
  });
});

describe("T118: saran tanggal kirim di form Hitung kebutuhan", () => {
  it("tanggal kirim toko 14 hari ke depan, termasuk pengiriman di luar jadwal yang berlaku", async () => {
    await masukOperator(gudangUji.id);
    const html = await buka();
    const saran = /data-saran-tanggal.*?<\/ul>/.exec(html)?.[0] ?? "";
    expect(saran).toContain("Saran tanggal kirim");
    // Kamis dan Senin rutin, Sabtu 24-10 di luar jadwal berlaku; bukan 17-10 (menunggu), 28-10 (sesudah 14 hari), atau
    // Selasa toko nonaktif. 14 hari = 13-10 sampai 26-10.
    expect([...saran.matchAll(/data-saran="([\d-]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]])).toEqual([
      ["2026-10-15", "Kamis, 15-10-2026"],
      ["2026-10-19", "Senin, 19-10-2026"],
      ["2026-10-22", "Kamis, 22-10-2026"],
      ["2026-10-24", "Sabtu, 24-10-2026"],
      ["2026-10-26", "Senin, 26-10-2026"],
    ]);
  });
});

describe("T118: susunan halaman", () => {
  it("kepala, Draft rencana, Jadwal toko, lalu Periode sumber; tanpa tabel Toko terhubung; Jadwal dan Periode sumber tertutup", async () => {
    await masukOperator(gudangUji.id);
    const html = await buka();

    const posisi = ["<h1", "data-ringkasan-periode-sumber", "data-draft-rencana", "data-jadwal", "data-periode-sumber"].map((p) =>
      html.indexOf(p),
    );
    expect(posisi.every((p) => p >= 0)).toBe(true);
    expect([...posisi].sort((a, b) => a - b)).toEqual(posisi);
    expect(html).toContain('id="jadwal-judul" class="flex items-center gap-3 text-xl font-semibold">');
    expect(html).toMatch(/id="jadwal-judul"[^>]*>.*?<\/span>Jadwal toko<\/h2>/);

    expect(html).not.toContain("Toko terhubung");
    // Status toko pindah ke tabel jadwal; peringatan toko nonaktif berjadwal tetap ada.
    expect(html).toMatch(new RegExp(`data-jadwal-toko="${tokoNonaktif.id}".*?data-status-toko="nonaktif".*?Nonaktif`));
    expect(html).toContain(`data-toko-nonaktif-berjadwal="${tokoNonaktif.id}"`);

    // Dua bagian buka-tutup, keduanya tertutup di awal: Jadwal toko dan Periode sumber.
    const lipat = [...html.matchAll(/<details\b[^>]*>.*?<h2 id="([^"]+)"/g)];
    expect(lipat.map((m) => m[1])).toEqual(["jadwal-judul", "periode-sumber-judul"]);
    expect(lipat.every((m) => !/<details\b[^>]*\bopen\b/.test(m[0]))).toBe(true);
    // Draft rencana tidak dilipat.
    expect(html.slice(html.indexOf("data-draft-rencana"), html.indexOf("data-jadwal"))).not.toContain("<details");
  });

  it("kepala menampilkan ringkasan periode sumber", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const kepalaHalaman = (html: string) => html.slice(html.indexOf("<h1"), html.indexOf("data-draft-rencana"));
    expect(kepalaHalaman(await buka())).toContain("Periode sumber: <span class=\"font-semibold\">");
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, gudangUji.id));
    await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, gudangUji.id));
    expect(kepalaHalaman(await buka())).toMatch(/data-ringkasan-periode-sumber.*?lucide-triangle-alert.*?Periode sumber belum ditetapkan admin/);
  });

  it("operator dengan satu gudang tidak melihat tautan Daftar gudang; dengan dua gudang dan admin melihatnya", async () => {
    await masukOperator(gudangUji.id);
    expect(await buka()).not.toContain("Daftar gudang");

    await masukOperator(gudangUji.id, await idGudangUji("Gudang Bali"));
    expect(await buka()).toMatch(/<a [^>]*href="\/pengiriman-gudang"[^>]*>.*?Daftar gudang<\/a>/);

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    expect(await buka()).toMatch(/<a [^>]*href="\/pengiriman-gudang"[^>]*>.*?Daftar gudang<\/a>/);
  });
});
