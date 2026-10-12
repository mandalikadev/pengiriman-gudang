import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { asc, eq, inArray } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasKeluargaAroma, barisRanking, keluargaAroma, versiRanking } from "@/server/db/schema";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji } from "@/server/impor/uji-bantu";
import { muatTinjauRanking, rankingBerlaku } from "@/server/ranking/ranking";
import { tahunRankingUjiBebas } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { cocokkanUlangRanking, daftarkanRanking, mintaUrlUnggahRanking, publikasikanRanking } from "./aksi";

type Sel = string | number | null;

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../tests/golden/ranking-september-2026.json"), "utf8"),
) as {
  sheet: string;
  header: string[];
  barisKosongDiabaikan: number[];
  baris: { baris: number; rank: number; variant: string; qtySales: number }[];
  tujuhBesar: string[];
  kasusError: { nama: string; jenis: string; header: string[]; baris: Sel[][] }[];
};

beforeAll(async () => {
  await pastikanBucket();
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  kepala.muatUlangGagal = false;
});

/** Workbook ranking seperti golden; `ganti` mengganti VARIANT baris ber-RANK tertentu. */
function workbookGolden(ganti: Record<number, string> = {}) {
  const baris: Sel[][] = [golden.header];
  for (const b of golden.baris) baris[b.baris - 1] = [b.rank, ganti[b.rank] ?? b.variant, b.qtySales];
  for (const nomor of golden.barisKosongDiabaikan) baris[nomor - 1] = [null, null, null];
  return buatWorkbookUji({ [golden.sheet]: baris });
}

/**
 * Memastikan setiap VARIANT golden punya alias. Alias unik di seluruh database test, jadi alias yang sudah ada
 * (dari run sebelumnya) dipakai apa adanya. Mengembalikan keluarga pemilik alias per VARIANT.
 */
async function pastikanAliasGolden() {
  for (const b of golden.baris) {
    const [ada] = await db.select().from(aliasKeluargaAroma).where(eq(aliasKeluargaAroma.alias, b.variant));
    if (ada) continue;
    const [keluarga] = await db.insert(keluargaAroma).values({ nama: b.variant }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: keluarga.id, alias: b.variant }).onConflictDoNothing();
  }
  const baris = await db
    .select({ alias: aliasKeluargaAroma.alias, id: keluargaAroma.id, nama: keluargaAroma.nama })
    .from(aliasKeluargaAroma)
    .innerJoin(keluargaAroma, eq(keluargaAroma.id, aliasKeluargaAroma.keluargaId))
    .where(inArray(aliasKeluargaAroma.alias, golden.baris.map((b) => b.variant)));
  return new Map(baris.map((b) => [b.alias, { id: b.id, nama: b.nama }]));
}

async function unggah(isi: Uint8Array) {
  const minta = await mintaUrlUnggahRanking();
  if (minta.keadaan !== "berhasil") throw new Error(minta.pesan);
  const jawaban = await fetch(minta.url, { method: "PUT", body: Buffer.from(isi) });
  expect(jawaban.ok).toBe(true);
  return minta.kunci;
}

async function unggahDanDaftarkan(isi: Uint8Array, { tahunRanking = 2026, bulanRanking = 9 } = {}) {
  const kunci = await unggah(isi);
  const hasil = await daftarkanRanking({ kunci, namaFile: "RANKING-SALES-SEPTEMBER-2026.xlsx", tahunRanking, bulanRanking });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  return hasil.idVersi;
}

async function statusVersi(...id: number[]) {
  const baris = await db.select({ id: versiRanking.id, status: versiRanking.status }).from(versiRanking).where(inArray(versiRanking.id, id));
  return Object.fromEntries(baris.map((b) => [b.id, b.status]));
}

describe("unggah → tinjau → publikasi (PRD A6 ▶ OD-05)", () => {
  it("file contoh golden dengan alias lengkap → bisa dipublikasikan; tujuh besar sesuai golden sebagai keluarga aroma", async () => {
    const keluargaPerAlias = await pastikanAliasGolden();
    const idVersi = await unggahDanDaftarkan(workbookGolden());

    const [versi] = await db.select().from(versiRanking).where(eq(versiRanking.id, idVersi));
    expect(versi).toMatchObject({
      bulanRanking: "2026-09",
      namaFile: "RANKING-SALES-SEPTEMBER-2026.xlsx",
      status: "draft",
      errorValidasi: [],
    });
    expect(versi.versi).toBeGreaterThanOrEqual(1);
    const baris = await db
      .select({ rank: barisRanking.rank, variant: barisRanking.variant, qtySales: barisRanking.qtySales, keluargaAromaId: barisRanking.keluargaAromaId })
      .from(barisRanking)
      .where(eq(barisRanking.versiId, idVersi))
      .orderBy(asc(barisRanking.rank));
    expect(baris).toEqual(
      golden.baris.map((b) => ({
        rank: b.rank,
        variant: b.variant,
        qtySales: b.qtySales,
        keluargaAromaId: keluargaPerAlias.get(b.variant)!.id,
      })),
    );

    expect(await publikasikanRanking({ idVersi })).toEqual({ keadaan: "berhasil" });
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "dipublikasikan" });

    const berlaku = await rankingBerlaku();
    expect(berlaku).toMatchObject({ idVersi, bulanRanking: "2026-09", versi: versi.versi });
    expect(berlaku!.tujuhBesar.map((t) => t.variant)).toEqual(golden.tujuhBesar);
    expect(berlaku!.tujuhBesar.map((t) => t.keluarga)).toEqual(golden.tujuhBesar.map((v) => keluargaPerAlias.get(v)));
    expect(berlaku!.tujuhBesar.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("versi = nomor urut unggahan per bulan ranking", async () => {
    const tahunRanking = await tahunRankingUjiBebas();
    const pertama = await unggahDanDaftarkan(workbookGolden(), { tahunRanking, bulanRanking: 1 });
    const kedua = await unggahDanDaftarkan(workbookGolden(), { tahunRanking, bulanRanking: 1 });
    const baris = await db
      .select({ id: versiRanking.id, versi: versiRanking.versi, bulanRanking: versiRanking.bulanRanking })
      .from(versiRanking)
      .where(inArray(versiRanking.id, [pertama, kedua]))
      .orderBy(asc(versiRanking.id));
    expect(baris).toEqual([
      { id: pertama, versi: 1, bulanRanking: `${tahunRanking}-01` },
      { id: kedua, versi: 2, bulanRanking: `${tahunRanking}-01` },
    ]);
  });

  it("publikasi kedua mengarsipkan yang pertama", async () => {
    await pastikanAliasGolden();
    const pertama = await unggahDanDaftarkan(workbookGolden());
    const kedua = await unggahDanDaftarkan(workbookGolden(), { bulanRanking: 10 });

    expect(await publikasikanRanking({ idVersi: pertama })).toEqual({ keadaan: "berhasil" });
    expect(await publikasikanRanking({ idVersi: kedua })).toEqual({ keadaan: "berhasil" });

    expect(await statusVersi(pertama, kedua)).toEqual({ [pertama]: "diarsipkan", [kedua]: "dipublikasikan" });
    expect((await rankingBerlaku())?.idVersi).toBe(kedua);
    expect(await db.select({ id: versiRanking.id }).from(versiRanking).where(eq(versiRanking.status, "dipublikasikan"))).toEqual([
      { id: kedua },
    ]);

    // Versi arsip tidak bisa dipublikasikan lagi.
    const ulang = await publikasikanRanking({ idVersi: pertama });
    expect(ulang.keadaan).toBe("gagal");
    expect(await statusVersi(pertama, kedua)).toEqual({ [pertama]: "diarsipkan", [kedua]: "dipublikasikan" });
  });

  it("satu baris tanpa alias cocok → publikasi ditolak dengan nama baris itu; setelah alias ditambah dan dicocokkan ulang → bisa dipublikasikan", async () => {
    const keluargaPerAlias = await pastikanAliasGolden();
    const asing = `VARIAN UJI ${randomUUID().slice(0, 8).toUpperCase()}`;
    const idVersi = await unggahDanDaftarkan(workbookGolden({ 3: asing }));
    const berlakuSebelum = await rankingBerlaku();

    const ditolak = await publikasikanRanking({ idVersi });
    expect(ditolak.keadaan).toBe("gagal");
    expect(ditolak.keadaan === "gagal" ? ditolak.pesan : "").toContain(asing);
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "draft" });
    expect((await rankingBerlaku())?.idVersi).toBe(berlakuSebelum?.idVersi);

    // Admin menambah alias (T44), lalu publikasi tanpa mencocokkan ulang diminta mencocokkan ulang dulu.
    const keluarga = keluargaPerAlias.get("ONLY THE BRAVE")!;
    await db.insert(aliasKeluargaAroma).values({ keluargaId: keluarga.id, alias: asing });
    const belumDicocokkan = await publikasikanRanking({ idVersi });
    expect(belumDicocokkan).toMatchObject({ keadaan: "gagal", pesan: expect.stringContaining("Cocokkan ulang") });

    expect(await cocokkanUlangRanking({ idVersi })).toEqual({ keadaan: "berhasil" });
    const [baris] = await db
      .select({ keluargaAromaId: barisRanking.keluargaAromaId })
      .from(barisRanking)
      .where(eq(barisRanking.versiId, idVersi))
      .orderBy(asc(barisRanking.rank))
      .offset(2);
    expect(baris.keluargaAromaId).toBe(keluarga.id);

    expect(await publikasikanRanking({ idVersi })).toEqual({ keadaan: "berhasil" });
    expect((await rankingBerlaku())?.tujuhBesar[2]).toEqual({ rank: 3, variant: asing, keluarga });
  });

  it("baris yang cocok ke keluarga aroma nonaktif → ditandai peringatan di tinjau, tetapi tetap bisa dipublikasikan (PRD A6 ▶ 2026-10-10)", async () => {
    await pastikanAliasGolden();
    const nama = `NONAKTIF UJI ${randomUUID().slice(0, 8).toUpperCase()}`;
    const [nonaktif] = await db.insert(keluargaAroma).values({ nama, aktif: false }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: nonaktif.id, alias: nama });
    const idVersi = await unggahDanDaftarkan(workbookGolden({ 4: nama }));

    const tinjau = await muatTinjauRanking(idVersi);
    expect(tinjau!.baris[3]).toEqual({ rank: 4, variant: nama, qtySales: golden.baris[3].qtySales, keluarga: { id: nonaktif.id, nama, aktif: false } });
    expect(tinjau!.baris.filter((b) => b.keluarga?.aktif === false).map((b) => b.rank)).toEqual([4]);
    expect(tinjau!.alasanTidakBisaDipublikasikan).toBeNull();

    expect(await publikasikanRanking({ idVersi })).toEqual({ keadaan: "berhasil" });
    expect((await rankingBerlaku())?.tujuhBesar[3]).toEqual({ rank: 4, variant: nama, keluarga: { id: nonaktif.id, nama } });
  });

  it("dua baris cocok ke keluarga aroma yang sama → publikasi ditahan dengan nama keluarga dan baris-barisnya (PRD A6 ▶ 2026-10-10)", async () => {
    await pastikanAliasGolden();
    const k = randomUUID().slice(0, 8).toUpperCase();
    const nama = `GANDA ${k}`;
    const [keluarga] = await db.insert(keluargaAroma).values({ nama }).returning();
    await db.insert(aliasKeluargaAroma).values([
      { keluargaId: keluarga.id, alias: `GANDA A ${k}` },
      { keluargaId: keluarga.id, alias: `GANDA B ${k}` },
    ]);
    const idVersi = await unggahDanDaftarkan(workbookGolden({ 2: `GANDA A ${k}`, 5: `GANDA B ${k}` }));
    const berlakuSebelum = await rankingBerlaku();
    const pesan = `Tidak bisa dipublikasikan: satu keluarga aroma hanya boleh muncul di satu baris ranking. ${nama} muncul di RANK 2 (GANDA A ${k}) dan RANK 5 (GANDA B ${k}). Perbaiki aliasnya di halaman Keluarga aroma, lalu cocokkan ulang.`;

    const tinjau = await muatTinjauRanking(idVersi);
    expect(tinjau!.keluargaGanda).toEqual([
      { keluarga: { id: keluarga.id, nama, aktif: true }, baris: [{ rank: 2, variant: `GANDA A ${k}` }, { rank: 5, variant: `GANDA B ${k}` }] },
    ]);
    expect(tinjau!.alasanTidakBisaDipublikasikan).toBe(pesan);

    expect(await publikasikanRanking({ idVersi })).toEqual({ keadaan: "gagal", pesan });
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "draft" });
    expect((await rankingBerlaku())?.idVersi).toBe(berlakuSebelum?.idVersi);
  });

  it("keluarga ganda yang muncul karena alias ditambah setelah ditinjau tetap ditahan di dalam transaksi publikasi", async () => {
    await pastikanAliasGolden();
    const k = randomUUID().slice(0, 8).toUpperCase();
    const nama = `GANDA ${k}`;
    const [keluarga] = await db.insert(keluargaAroma).values({ nama }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: keluarga.id, alias: `GANDA A ${k}` });
    const idVersi = await unggahDanDaftarkan(workbookGolden({ 1: `GANDA A ${k}`, 9: `GANDA B ${k}`, 12: `GANDA C ${k}` }));

    // Saat ditinjau, RANK 9 dan 12 belum cocok. Alias ditambah ke keluarga yang sama tanpa mencocokkan ulang.
    await db.insert(aliasKeluargaAroma).values([
      { keluargaId: keluarga.id, alias: `GANDA B ${k}` },
      { keluargaId: keluarga.id, alias: `GANDA C ${k}` },
    ]);
    expect(await publikasikanRanking({ idVersi })).toEqual({
      keadaan: "gagal",
      pesan: `Tidak bisa dipublikasikan: satu keluarga aroma hanya boleh muncul di satu baris ranking. ${nama} muncul di RANK 1 (GANDA A ${k}), RANK 9 (GANDA B ${k}), dan RANK 12 (GANDA C ${k}). Perbaiki aliasnya di halaman Keluarga aroma, lalu cocokkan ulang.`,
    });
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "draft" });
  });

  it.each(golden.kasusError)("file dengan error validasi ($nama) → draft dengan error $jenis, tidak bisa dipublikasikan", async (kasus) => {
    const idVersi = await unggahDanDaftarkan(buatWorkbookUji({ [golden.sheet]: [kasus.header, ...kasus.baris] }));
    const [versi] = await db.select().from(versiRanking).where(eq(versiRanking.id, idVersi));
    expect(versi.status).toBe("draft");
    expect(versi.errorValidasi.map((e) => e.jenis)).toContain(kasus.jenis);
    expect(await db.select().from(barisRanking).where(eq(barisRanking.versiId, idVersi))).toEqual([]);

    const hasil = await publikasikanRanking({ idVersi });
    expect(hasil.keadaan).toBe("gagal");
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "draft" });
  });

  it("file tanpa sheet RANKING SALES (mis. bukan workbook ranking) → draft dengan error struktur-tidak-sesuai", async () => {
    const idVersi = await unggahDanDaftarkan(new TextEncoder().encode("bukan excel"));
    const [versi] = await db.select().from(versiRanking).where(eq(versiRanking.id, idVersi));
    expect(versi.errorValidasi.map((e) => e.jenis)).toEqual(["struktur-tidak-sesuai"]);
  });

  it("muat ulang tampilan gagal setelah publikasi → tersimpanGagalMuatUlang, publikasi tetap terjadi", async () => {
    await pastikanAliasGolden();
    const idVersi = await unggahDanDaftarkan(workbookGolden());
    kepala.muatUlangGagal = true;
    expect(await publikasikanRanking({ idVersi })).toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "dipublikasikan" });
  });
});

describe("non-admin ditolak di server", () => {
  it("viewer tidak bisa meminta URL unggah, mendaftarkan, mencocokkan ulang, atau mempublikasikan ranking", async () => {
    await pastikanAliasGolden();
    const idVersi = await unggahDanDaftarkan(workbookGolden());
    const kunci = await unggah(workbookGolden());
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;

    await expect(mintaUrlUnggahRanking()).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(
      daftarkanRanking({ kunci, namaFile: "x.xlsx", tahunRanking: 2026, bulanRanking: 9 }),
    ).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(cocokkanUlangRanking({ idVersi })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(publikasikanRanking({ idVersi })).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await db.select().from(versiRanking).where(eq(versiRanking.kunciObjek, kunci))).toEqual([]);
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "draft" });
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    await pastikanAliasGolden();
    const idVersi = await unggahDanDaftarkan(workbookGolden());
    kepala.cookie = "";
    await expect(mintaUrlUnggahRanking()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    await expect(publikasikanRanking({ idVersi })).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await statusVersi(idVersi)).toEqual({ [idVersi]: "draft" });
  });
});
