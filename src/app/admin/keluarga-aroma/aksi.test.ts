import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma } from "@/server/db/schema";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { hapusAlias, tambahAlias, tambahKeluargaAroma, ubahKeluargaAroma } from "./aksi";

/** Teks unik per test: database test tidak dikosongkan antar putaran, dan alias unik di seluruh keluarga. */
function unik(awalan: string) {
  return `${awalan} ${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function buatKeluargaUji(nama = unik("KELUARGA UJI")) {
  const [baris] = await db.insert(keluargaAroma).values({ nama }).returning();
  return baris;
}

async function aliasMilik(idKeluarga: number) {
  const baris = await db.select().from(aliasKeluargaAroma).where(eq(aliasKeluargaAroma.keluargaId, idKeluarga));
  return baris.map((b) => b.alias);
}

async function cariKeluarga(id: number) {
  const [baris] = await db.select().from(keluargaAroma).where(eq(keluargaAroma.id, id));
  return baris;
}

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

describe("non-admin ditolak di server sebelum membaca atau menulis", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
  });

  it("tambahKeluargaAroma ditolak dan tidak ada keluarga yang dibuat", async () => {
    const nama = unik("OLEH VIEWER");
    await expect(tambahKeluargaAroma({ nama })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await db.select().from(keluargaAroma).where(eq(keluargaAroma.nama, nama))).toEqual([]);
  });

  it("ubahKeluargaAroma ditolak dan keluarga tidak berubah", async () => {
    const keluarga = await buatKeluargaUji();
    await expect(
      ubahKeluargaAroma({ idKeluarga: keluarga.id, nama: "DIUBAH VIEWER", aktif: false }),
    ).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await cariKeluarga(keluarga.id)).toEqual(keluarga);
  });

  it("tambahAlias ditolak dan alias tidak bertambah", async () => {
    const keluarga = await buatKeluargaUji();
    await expect(tambahAlias({ idKeluarga: keluarga.id, alias: unik("ALIAS") })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );
    expect(await aliasMilik(keluarga.id)).toEqual([]);
  });

  it("hapusAlias ditolak dan alias tetap ada", async () => {
    const keluarga = await buatKeluargaUji();
    const alias = unik("ALIAS");
    const [baris] = await db.insert(aliasKeluargaAroma).values({ keluargaId: keluarga.id, alias }).returning();
    await expect(hapusAlias({ idAlias: baris.id })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await aliasMilik(keluarga.id)).toEqual([alias]);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    kepala.cookie = "";
    const nama = unik("TANPA SESI");
    await expect(tambahKeluargaAroma({ nama })).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await db.select().from(keluargaAroma).where(eq(keluargaAroma.nama, nama))).toEqual([]);
  });
});

describe("admin mengelola keluarga aroma", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  });

  it("tambah keluarga: tersimpan aktif", async () => {
    const nama = unik("GIFT SET BOX");
    expect(await tambahKeluargaAroma({ nama })).toEqual({ keadaan: "berhasil" });
    const [baris] = await db.select().from(keluargaAroma).where(eq(keluargaAroma.nama, nama));
    expect(baris).toMatchObject({ nama, aktif: true });
  });

  it("tambah keluarga tanpa nama gagal", async () => {
    expect(await tambahKeluargaAroma({ nama: "   " })).toEqual({ keadaan: "gagal", pesan: "Nama keluarga wajib diisi." });
  });

  it("ubah keluarga: nama dan status aktif tersimpan", async () => {
    const keluarga = await buatKeluargaUji();
    const namaBaru = unik("NAMA BARU");
    expect(await ubahKeluargaAroma({ idKeluarga: keluarga.id, nama: namaBaru, aktif: false })).toEqual({
      keadaan: "berhasil",
    });
    expect(await cariKeluarga(keluarga.id)).toMatchObject({ nama: namaBaru, aktif: false });
  });

  it("ubah keluarga yang tidak ada gagal", async () => {
    expect(await ubahKeluargaAroma({ idKeluarga: 2_000_000_000, nama: "X", aktif: true })).toEqual({
      keadaan: "gagal",
      pesan: "Keluarga aroma tidak ditemukan.",
    });
  });

  it("tambah alias: disimpan setelah normalisasi (huruf besar, spasi dirapikan)", async () => {
    const keluarga = await buatKeluargaUji();
    const kode = randomUUID().slice(0, 8);
    expect(await tambahAlias({ idKeluarga: keluarga.id, alias: ` gorgeous  tuberose ${kode} ` })).toEqual({
      keadaan: "berhasil",
    });
    expect(await aliasMilik(keluarga.id)).toEqual([`GORGEOUS TUBEROSE ${kode.toUpperCase()}`]);
  });

  it("alias yang sama tidak bisa dipakai dua keluarga (juga jika ditulis berbeda sebelum normalisasi)", async () => {
    const pertama = await buatKeluargaUji(unik("PERTAMA"));
    const kedua = await buatKeluargaUji(unik("KEDUA"));
    const alias = unik("GORGEOUS TUBEROSE");
    expect(await tambahAlias({ idKeluarga: pertama.id, alias })).toEqual({ keadaan: "berhasil" });

    expect(await tambahAlias({ idKeluarga: kedua.id, alias: `  ${alias.toLowerCase()}` })).toEqual({
      keadaan: "gagal",
      pesan: `Alias ${alias} sudah dipakai keluarga ${pertama.nama}.`,
    });
    expect(await aliasMilik(pertama.id)).toEqual([alias]);
    expect(await aliasMilik(kedua.id)).toEqual([]);
  });

  it("database juga menolak alias ganda di dua keluarga", async () => {
    const pertama = await buatKeluargaUji();
    const kedua = await buatKeluargaUji();
    const alias = unik("ALIAS GANDA");
    await db.insert(aliasKeluargaAroma).values({ keluargaId: pertama.id, alias });
    await expect(db.insert(aliasKeluargaAroma).values({ keluargaId: kedua.id, alias })).rejects.toThrow();
  });

  it("tambah alias kosong gagal; tambah alias ke keluarga yang tidak ada gagal", async () => {
    const keluarga = await buatKeluargaUji();
    expect(await tambahAlias({ idKeluarga: keluarga.id, alias: "  " })).toEqual({
      keadaan: "gagal",
      pesan: "Alias wajib diisi.",
    });
    expect(await tambahAlias({ idKeluarga: 2_000_000_000, alias: unik("ALIAS") })).toEqual({
      keadaan: "gagal",
      pesan: "Keluarga aroma tidak ditemukan.",
    });
  });

  it("hapus alias: alias hilang dan bisa dipakai keluarga lain", async () => {
    const pertama = await buatKeluargaUji();
    const kedua = await buatKeluargaUji();
    const alias = unik("PINDAH");
    const [baris] = await db.insert(aliasKeluargaAroma).values({ keluargaId: pertama.id, alias }).returning();
    expect(await hapusAlias({ idAlias: baris.id })).toEqual({ keadaan: "berhasil" });
    expect(await aliasMilik(pertama.id)).toEqual([]);
    expect(await tambahAlias({ idKeluarga: kedua.id, alias })).toEqual({ keadaan: "berhasil" });
  });

  it("hapus alias yang tidak ada gagal", async () => {
    expect(await hapusAlias({ idAlias: 2_000_000_000 })).toEqual({ keadaan: "gagal", pesan: "Alias tidak ditemukan." });
  });

  it("tersimpan, tetapi gagal memuat ulang tampilan", async () => {
    kepala.muatUlangGagal = true;
    const nama = unik("MUAT ULANG");
    expect(await tambahKeluargaAroma({ nama })).toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await db.select().from(keluargaAroma).where(eq(keluargaAroma.nama, nama))).toHaveLength(1);
  });
});
