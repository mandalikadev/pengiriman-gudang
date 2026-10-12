import { and, eq, inArray, notInArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import {
  aliasKeluargaAroma,
  aliasNamaStok,
  keluargaAroma,
  produk,
  riwayatPemetaanProduk,
  segmenKodeKeluargaAroma,
  user,
  type StatusKeluargaAroma,
} from "@/server/db/schema";
import { terapkanPemetaan } from "@/server/keluarga-aroma/pemetaan";

import berkasAliasStok from "./alias-nama-stok.json";
import berkasKeluarga from "./keluarga-aroma.json";
import berkasProduk from "./produk.json";
import { seedDataMaster } from "./seed-data-master";

// Seed data master (T88, PRD A3 ▶ Keputusan 2026-10-12, UAT kedua). Database test dipakai bersama berkas test lain
// (berurutan, tidak dikosongkan antarberkas): berkas lain bisa sudah membuat produk dengan kode yang sama (mis.
// PW110P-GOR) lalu mengubah status pemetaannya, atau keluarga bernama sama.
// Keadaan sebelum seed dicatat, produk berkas yang sudah ada dikembalikan ke `belum-dipetakan` supaya hitungan literal
// berlaku tanpa syarat, lalu di `afterAll` semua yang ditambahkan seed (dan test ini) dihapus dan status pemetaan
// produk yang sudah ada dipulihkan.

const KODE_BERKAS = berkasProduk.map((p) => p.kode);
const NAMA_KELUARGA_BERKAS = berkasKeluarga.map((k) => k.nama);
const ALIAS_STOK_BERKAS = berkasAliasStok.map((a) => a.alias);

let idAdmin: string;
let adminDinonaktifkan: string[] = [];

type Keadaan = {
  idKeluarga: number[];
  idAliasKeluarga: number[];
  idSegmen: number[];
  idRiwayat: number[];
  aliasStok: string[];
  produk: { kode: string; status: StatusKeluargaAroma; idKeluarga: number | null }[];
};
let sebelumSeed: Keadaan;

async function catatKeadaan(): Promise<Keadaan> {
  return {
    idKeluarga: (await db.select({ id: keluargaAroma.id }).from(keluargaAroma)).map((b) => b.id),
    idAliasKeluarga: (await db.select({ id: aliasKeluargaAroma.id }).from(aliasKeluargaAroma)).map((b) => b.id),
    idSegmen: (await db.select({ id: segmenKodeKeluargaAroma.id }).from(segmenKodeKeluargaAroma)).map((b) => b.id),
    idRiwayat: (await db.select({ id: riwayatPemetaanProduk.id }).from(riwayatPemetaanProduk)).map((b) => b.id),
    aliasStok: (await db.select({ alias: aliasNamaStok.alias }).from(aliasNamaStok)).map((b) => b.alias),
    produk: await db
      .select({ kode: produk.kode, status: produk.statusKeluargaAroma, idKeluarga: produk.keluargaAromaId })
      .from(produk)
      .where(inArray(produk.kode, KODE_BERKAS)),
  };
}

/** Baris yang disentuh seed: produk berkas, keluarga berkas beserta alias dan segmennya, riwayat, alias stok berkas. */
async function barisSeed() {
  const keluarga = await db
    .select()
    .from(keluargaAroma)
    .where(inArray(keluargaAroma.nama, NAMA_KELUARGA_BERKAS))
    .orderBy(keluargaAroma.id);
  const idKeluarga = keluarga.map((k) => k.id);
  return {
    produk: await db.select().from(produk).where(inArray(produk.kode, KODE_BERKAS)).orderBy(produk.kode),
    keluarga,
    alias: await db
      .select()
      .from(aliasKeluargaAroma)
      .where(inArray(aliasKeluargaAroma.keluargaId, idKeluarga))
      .orderBy(aliasKeluargaAroma.id),
    segmen: await db
      .select()
      .from(segmenKodeKeluargaAroma)
      .where(inArray(segmenKodeKeluargaAroma.keluargaId, idKeluarga))
      .orderBy(segmenKodeKeluargaAroma.id),
    riwayat: await db
      .select()
      .from(riwayatPemetaanProduk)
      .where(inArray(riwayatPemetaanProduk.kodeProduk, KODE_BERKAS))
      .orderBy(riwayatPemetaanProduk.id),
    aliasStok: await db
      .select()
      .from(aliasNamaStok)
      .where(inArray(aliasNamaStok.alias, ALIAS_STOK_BERKAS))
      .orderBy(aliasNamaStok.alias),
  };
}

async function pemetaanProduk(kode: string) {
  const [baris] = await db
    .select({ status: produk.statusKeluargaAroma, keluarga: keluargaAroma.nama })
    .from(produk)
    .leftJoin(keluargaAroma, eq(keluargaAroma.id, produk.keluargaAromaId))
    .where(eq(produk.kode, kode));
  return baris;
}

async function idKeluargaBernama(nama: string) {
  const [baris] = await db
    .select({ id: keluargaAroma.id })
    .from(keluargaAroma)
    .where(eq(keluargaAroma.nama, nama))
    .orderBy(keluargaAroma.id)
    .limit(1);
  return baris.id;
}

async function nonaktifkanAdminLain(kecuali: string) {
  const aktif = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.banned, false)));
  const target = aktif.map((a) => a.id).filter((id) => id !== kecuali);
  if (target.length > 0) await db.update(user).set({ banned: true }).where(inArray(user.id, target));
  return target;
}

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  adminDinonaktifkan = await nonaktifkanAdminLain(idAdmin);
  sebelumSeed = await catatKeadaan();
  // Keadaan awal seperti instalasi baru: produk berkas yang sudah dibuat berkas test lain belum dipetakan.
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "belum-dipetakan", keluargaAromaId: null })
    .where(inArray(produk.kode, KODE_BERKAS));
});

afterAll(async () => {
  const s = sebelumSeed;
  // Produk yang sudah ada sebelum seed: kembalikan status pemetaannya.
  for (const p of s.produk) {
    await db.update(produk).set({ statusKeluargaAroma: p.status, keluargaAromaId: p.idKeluarga }).where(eq(produk.kode, p.kode));
  }
  // Daftar lama kosong = semua baris ditambahkan selama berkas ini (`where(undefined)` menghapus semuanya).
  await db.delete(riwayatPemetaanProduk).where(s.idRiwayat.length ? notInArray(riwayatPemetaanProduk.id, s.idRiwayat) : undefined);
  await db.delete(aliasNamaStok).where(s.aliasStok.length ? notInArray(aliasNamaStok.alias, s.aliasStok) : undefined);
  const kodeLama = s.produk.map((p) => p.kode);
  await db
    .delete(produk)
    .where(kodeLama.length ? and(inArray(produk.kode, KODE_BERKAS), notInArray(produk.kode, kodeLama)) : inArray(produk.kode, KODE_BERKAS));
  await db
    .delete(segmenKodeKeluargaAroma)
    .where(s.idSegmen.length ? notInArray(segmenKodeKeluargaAroma.id, s.idSegmen) : undefined);
  await db
    .delete(aliasKeluargaAroma)
    .where(s.idAliasKeluarga.length ? notInArray(aliasKeluargaAroma.id, s.idAliasKeluarga) : undefined);
  await db.delete(keluargaAroma).where(s.idKeluarga.length ? notInArray(keluargaAroma.id, s.idKeluarga) : undefined);

  await db.update(user).set({ banned: false }).where(eq(user.id, idAdmin));
  if (adminDinonaktifkan.length > 0) await db.update(user).set({ banned: false }).where(inArray(user.id, adminDinonaktifkan));
});

describe("seedDataMaster", () => {
  it("tanpa admin aktif → gagal dengan pesan seed admin, tidak menulis apa pun", async () => {
    await db.update(user).set({ banned: true }).where(eq(user.id, idAdmin));
    try {
      const sebelum = await barisSeed();
      await expect(seedDataMaster()).resolves.toEqual({ keadaan: "gagal", pesan: "Jalankan pnpm db:seed-admin dulu." });
      expect(await barisSeed()).toEqual(sebelum);
    } finally {
      await db.update(user).set({ banned: false }).where(eq(user.id, idAdmin));
    }
  });

  it("mengisi 359 produk, 29 keluarga (alias + segmen kode), 347 terpetakan + 12 tanpa aroma, dan 205 alias nama stok", async () => {
    const hasil = await seedDataMaster();
    expect(hasil).toMatchObject({
      keadaan: "berhasil",
      // Produk berkas yang sudah dibuat berkas test lain tidak ditambahkan ulang.
      produkDitambahkan: 359 - sebelumSeed.produk.length,
      pemetaanDiterapkan: 359,
    });

    const { produk: daftarProduk, keluarga, alias, segmen, aliasStok } = await barisSeed();
    expect(daftarProduk).toHaveLength(359);
    expect(new Set(keluarga.map((k) => k.nama)).size).toBe(29);
    expect(daftarProduk.filter((p) => p.statusKeluargaAroma === "terpetakan")).toHaveLength(347);
    expect(daftarProduk.filter((p) => p.statusKeluargaAroma === "tanpa-aroma")).toHaveLength(12);
    expect(aliasStok).toHaveLength(205);

    // Alias = nama keluarga; segmen kode GIFT SET BOX: B dan W.
    const namaPerId = new Map(keluarga.map((k) => [k.id, k.nama]));
    for (const nama of NAMA_KELUARGA_BERKAS) {
      expect(alias.some((a) => a.alias === nama && namaPerId.get(a.keluargaId) === nama), nama).toBe(true);
    }
    expect(segmen.filter((s) => namaPerId.get(s.keluargaId) === "GIFT SET BOX").map((s) => s.segmen).sort()).toEqual(["B", "W"]);
    const gor = segmen.find((s) => s.segmen === "GOR");
    expect(gor && namaPerId.get(gor.keluargaId)).toBe("GORGEOUS TUBEROSE");

    // Baris literal issue T88.
    expect(await pemetaanProduk("PW110P-GOR")).toEqual({ status: "terpetakan", keluarga: "GORGEOUS TUBEROSE" });
    expect(await pemetaanProduk("DD-GS15-B")).toEqual({ status: "terpetakan", keluarga: "GIFT SET BOX" });
    expect(await pemetaanProduk("100-ALK")).toEqual({ status: "tanpa-aroma", keluarga: null });
    expect(aliasStok.find((a) => a.alias === "GORGEOUS TUBEROSE - 110ML M PARFUM")?.kodeProduk).toBe("PW110P-GOR");
    expect(daftarProduk.find((p) => p.kode === "DW110E-GOR-T")).toMatchObject({
      klasifikasi: "manual",
      alasanManual: "display-tester",
    });

    // Produk yang ditambahkan seed: isi persis berkas, tanpa impor pendaftar.
    const kodeLama = new Set(sebelumSeed.produk.map((p) => p.kode));
    for (const p of berkasProduk.filter((b) => !kodeLama.has(b.kode))) {
      expect(daftarProduk.find((d) => d.kode === p.kode), p.kode).toMatchObject({ ...p, didaftarkanOlehImporId: null });
    }
  });

  it("riwayat pemetaan tercatat atas nama admin pertama untuk setiap produk yang dipetakan seed", async () => {
    const { produk: daftarProduk, riwayat } = await barisSeed();
    const riwayatSeed = riwayat.filter((r) => !sebelumSeed.idRiwayat.includes(r.id));

    expect(riwayatSeed).toHaveLength(359);
    for (const p of daftarProduk) {
      expect(riwayatSeed.find((r) => r.kodeProduk === p.kode), p.kode).toMatchObject({
        dariStatus: "belum-dipetakan",
        dariKeluargaId: null,
        keStatus: p.statusKeluargaAroma,
        keKeluargaId: p.keluargaAromaId,
        pelaku: idAdmin,
      });
    }
  });

  it("seed kedua tidak menambah atau mengubah baris", async () => {
    const sebelum = await barisSeed();
    await expect(seedDataMaster()).resolves.toEqual({
      keadaan: "berhasil",
      produkDitambahkan: 0,
      keluargaDitambahkan: 0,
      aliasKeluargaDitambahkan: 0,
      segmenKodeDitambahkan: 0,
      pemetaanDiterapkan: 0,
      aliasStokDitambahkan: 0,
    });
    expect(await barisSeed()).toEqual(sebelum);
  });

  it("pemetaan yang diubah admin sebelum seed tidak ditimpa", async () => {
    const idNo1 = await idKeluargaBernama("NO1");
    await terapkanPemetaan(idAdmin, [
      { kodeProduk: "PW110P-GOR", tujuan: { status: "tanpa-aroma" } },
      { kodeProduk: "100-ALK", tujuan: { status: "terpetakan", idKeluarga: idNo1 } },
    ]);
    const sebelum = await barisSeed();

    await expect(seedDataMaster()).resolves.toMatchObject({ keadaan: "berhasil", pemetaanDiterapkan: 0 });

    expect(await pemetaanProduk("PW110P-GOR")).toEqual({ status: "tanpa-aroma", keluarga: null });
    expect(await pemetaanProduk("100-ALK")).toEqual({ status: "terpetakan", keluarga: "NO1" });
    expect(await barisSeed()).toEqual(sebelum);
  });
});
