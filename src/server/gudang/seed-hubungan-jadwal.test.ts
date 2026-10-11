import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, jadwalToko, toko, user } from "@/server/db/schema";

import { seedHubunganJadwalAwal } from "./seed-hubungan-jadwal";
import { seedMasterGudangToko } from "./seed-master";

// Seed hubungan toko–gudang dan jadwal awal (T84, PRD A3 dan A5 ▶ Keputusan 2026-10-12). Ekspektasi disalin dari tabel PRD A5.

const TOKO_SEED = [
  "SMB", "BOTANI", "MKG", "KOKAS", "SMS", "ALSUT", "BXC", "KARAWACI", "CCM", "BSD", "DELTAMAS", "PMB", "KUNCIT",
  "TSM CBB", "SENTUL", "LMK", "DMB", "LWB", "PASKAL", "PVJ",
];
const TOKO_TERBUKA = ["PMS", "PMJ", "QUEEN", "MKS", "DPM"];

let idAdmin: string;
/** Admin aktif lain yang dinonaktifkan sementara selama berkas ini, supaya admin pertama yang aktif pasti `idAdmin`. */
let adminDinonaktifkan: string[] = [];

async function idTokoMaster(nama: readonly string[]) {
  const baris = await db.select({ id: toko.id, nama: toko.nama }).from(toko).where(inArray(toko.nama, [...nama]));
  return new Map(baris.map((b) => [b.nama, b.id]));
}

async function hubunganSeed() {
  const idToko = [...(await idTokoMaster(TOKO_SEED)).values()];
  return db
    .select({ tokoId: hubunganTokoGudang.tokoId, gudang: gudang.nama })
    .from(hubunganTokoGudang)
    .innerJoin(gudang, eq(gudang.id, hubunganTokoGudang.gudangId))
    .where(inArray(hubunganTokoGudang.tokoId, idToko))
    .orderBy(hubunganTokoGudang.tokoId);
}

async function jadwalSeed() {
  const idToko = [...(await idTokoMaster(TOKO_SEED)).values()];
  return db.select().from(jadwalToko).where(inArray(jadwalToko.tokoId, idToko)).orderBy(jadwalToko.id);
}

async function nonaktifkanAdminLain(kecuali: string[]) {
  const aktif = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.banned, false)));
  const target = aktif.map((a) => a.id).filter((id) => !kecuali.includes(id));
  if (target.length > 0) await db.update(user).set({ banned: true }).where(inArray(user.id, target));
  return target;
}

beforeAll(async () => {
  await seedMasterGudangToko();
  idAdmin = (await buatPenggunaUji("admin")).id;
  adminDinonaktifkan = await nonaktifkanAdminLain([idAdmin]);
});

afterAll(async () => {
  // Bersihkan data seed supaya berkas test lain yang memakai gudang Bali/Bandung/Cibubur tidak melihat toko master ini.
  const idToko = [...(await idTokoMaster(TOKO_SEED)).values()];
  await db.delete(jadwalToko).where(inArray(jadwalToko.tokoId, idToko));
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, idToko));
  await db.update(user).set({ banned: false }).where(eq(user.id, idAdmin));
  if (adminDinonaktifkan.length > 0) {
    await db.update(user).set({ banned: false }).where(inArray(user.id, adminDinonaktifkan));
  }
});

describe("seedHubunganJadwalAwal", () => {
  it("tanpa admin aktif → gagal dengan pesan seed admin, tidak menulis apa pun", async () => {
    await db.update(user).set({ banned: true }).where(eq(user.id, idAdmin));
    try {
      await expect(seedHubunganJadwalAwal()).resolves.toEqual({ keadaan: "gagal", pesan: "Jalankan pnpm db:seed-admin dulu." });
      expect(await hubunganSeed()).toEqual([]);
      expect(await jadwalSeed()).toEqual([]);
    } finally {
      await db.update(user).set({ banned: false }).where(eq(user.id, idAdmin));
    }
  });

  it("mengisi 20 hubungan dan 20 jadwal aktif persis tabel PRD A5 atas nama admin pertama", async () => {
    await expect(seedHubunganJadwalAwal()).resolves.toEqual({ keadaan: "berhasil", hubunganDibuat: 20, jadwalDibuat: 20 });

    const idToko = await idTokoMaster([...TOKO_SEED, ...TOKO_TERBUKA]);
    const gudangToko = new Map((await hubunganSeed()).map((h) => [h.tokoId, h.gudang]));
    expect(gudangToko.size).toBe(20);
    for (const nama of ["SMB", "BOTANI", "MKG", "KOKAS", "SMS", "ALSUT", "BXC", "KARAWACI", "CCM", "BSD", "DELTAMAS", "PMB", "KUNCIT", "TSM CBB", "SENTUL", "LMK"]) {
      expect(gudangToko.get(idToko.get(nama)!), nama).toBe("Gudang Cibubur");
    }
    for (const nama of ["DMB", "LWB"]) expect(gudangToko.get(idToko.get(nama)!), nama).toBe("Gudang Bali");
    for (const nama of ["PASKAL", "PVJ"]) expect(gudangToko.get(idToko.get(nama)!), nama).toBe("Gudang Bandung");

    const semuaJadwal = await jadwalSeed();
    expect(semuaJadwal).toHaveLength(20);
    expect(semuaJadwal.every((j) => j.status === "aktif" && j.dibuatOleh === idAdmin)).toBe(true);
    const jadwalToko_ = (nama: string) => {
      const j = semuaJadwal.find((j) => j.tokoId === idToko.get(nama));
      return j && { pola: j.pola, hariKirim: j.hariKirim, tanggalJangkar: j.tanggalJangkar };
    };

    // Baris literal dari tabel PRD A5.
    expect(jadwalToko_("SMB")).toEqual({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 0 },
        { hari: "Kamis", persiapanHari: 1 },
      ],
      tanggalJangkar: null,
    });
    expect(jadwalToko_("BXC")).toEqual({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapanHari: 1 }], tanggalJangkar: "2026-10-14" });
    expect(jadwalToko_("CCM")).toEqual({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapanHari: 1 }], tanggalJangkar: "2026-10-21" });
    expect(jadwalToko_("LWB")).toEqual({
      pola: "3x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 1 },
        { hari: "Rabu", persiapanHari: 1 },
        { hari: "Jumat", persiapanHari: 1 },
      ],
      tanggalJangkar: null,
    });
    expect(jadwalToko_("PMB")).toEqual({ pola: "mingguan", hariKirim: [{ hari: "Kamis", persiapanHari: 2 }], tanggalJangkar: null });
    expect(jadwalToko_("TSM CBB")).toEqual({ pola: "mingguan", hariKirim: [{ hari: "Jumat", persiapanHari: 0 }], tanggalJangkar: null });
    expect(jadwalToko_("PASKAL")).toEqual({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 1 },
        { hari: "Jumat", persiapanHari: 1 },
      ],
      tanggalJangkar: null,
    });
    expect(jadwalToko_("PVJ")).toEqual({ pola: "mingguan", hariKirim: [{ hari: "Selasa", persiapanHari: 1 }], tanggalJangkar: null });

    // PMS, PMJ, QUEEN, MKS, DPM tetap terbuka (OD-12): tanpa hubungan dan tanpa jadwal.
    const idTerbuka = TOKO_TERBUKA.map((nama) => idToko.get(nama)!);
    expect(await db.select().from(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, idTerbuka))).toEqual([]);
    expect(await db.select().from(jadwalToko).where(inArray(jadwalToko.tokoId, idTerbuka))).toEqual([]);
  });

  it("seed kedua tidak menambah atau mengubah baris", async () => {
    const hubunganSebelum = await hubunganSeed();
    const jadwalSebelum = await jadwalSeed();

    await expect(seedHubunganJadwalAwal()).resolves.toEqual({ keadaan: "berhasil", hubunganDibuat: 0, jadwalDibuat: 0 });

    expect(await hubunganSeed()).toEqual(hubunganSebelum);
    expect(await jadwalSeed()).toEqual(jadwalSebelum);
  });
});
