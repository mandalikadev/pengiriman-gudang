import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { keluargaAroma, produk, riwayatPemetaanProduk } from "@/server/db/schema";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { konfirmasiPemetaan } from "./aksi";

/** Kode unik per test: database test tidak dikosongkan antar putaran. */
function kodeUnik(pola: string) {
  return pola.replace("X", randomUUID().slice(0, 8).toUpperCase());
}

async function buatProduk(kode: string) {
  await db.insert(produk).values({ kode, nama: `PRODUK ${kode}`, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" });
  return kode;
}

async function buatKeluarga() {
  const [baris] = await db
    .insert(keluargaAroma)
    .values({ nama: `KELUARGA ${randomUUID().slice(0, 8).toUpperCase()}` })
    .returning();
  return baris;
}

async function pemetaanProduk(kode: string) {
  const [baris] = await db
    .select({ status: produk.statusKeluargaAroma, idKeluarga: produk.keluargaAromaId })
    .from(produk)
    .where(eq(produk.kode, kode));
  return baris;
}

async function riwayatProduk(kode: string) {
  return db
    .select()
    .from(riwayatPemetaanProduk)
    .where(eq(riwayatPemetaanProduk.kodeProduk, kode))
    .orderBy(desc(riwayatPemetaanProduk.id));
}

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

describe("non-admin ditolak di server sebelum membaca atau menulis", () => {
  it("viewer ditolak dan status produk tidak berubah, tanpa riwayat", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    const kode = await buatProduk(kodeUnik("DW110E-X"));
    await expect(
      konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "tanpa-aroma" } }] }),
    ).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await pemetaanProduk(kode)).toEqual({ status: "belum-dipetakan", idKeluarga: null });
    expect(await riwayatProduk(kode)).toEqual([]);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    const kode = await buatProduk(kodeUnik("DW110E-X"));
    await expect(
      konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "tanpa-aroma" } }] }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await pemetaanProduk(kode)).toEqual({ status: "belum-dipetakan", idKeluarga: null });
  });
});

describe("admin mengonfirmasi pemetaan", () => {
  let idAdmin: string;
  beforeEach(async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    idAdmin = admin.id;
  });

  it("tetapkan keluarga: produk terpetakan dan riwayat mencatat siapa, kapan, dari → ke", async () => {
    const keluarga = await buatKeluarga();
    const kode = await buatProduk(kodeUnik("DW110E-X-R"));
    const hasil = await konfirmasiPemetaan({
      butir: [{ kodeProduk: kode, tujuan: { status: "terpetakan", idKeluarga: keluarga.id } }],
    });
    expect(hasil).toEqual({
      keadaan: "berhasil",
      hasil: [
        {
          kodeProduk: kode,
          status: "berhasil",
          dari: { status: "belum-dipetakan", keluarga: null },
          ke: { status: "terpetakan", keluarga: { id: keluarga.id, nama: keluarga.nama } },
        },
      ],
    });
    expect(await pemetaanProduk(kode)).toEqual({ status: "terpetakan", idKeluarga: keluarga.id });
    const [riwayat] = await riwayatProduk(kode);
    expect(riwayat).toMatchObject({
      dariStatus: "belum-dipetakan",
      dariKeluargaId: null,
      keStatus: "terpetakan",
      keKeluargaId: keluarga.id,
      pelaku: idAdmin,
    });
    expect(riwayat.terjadiPada).toBeInstanceOf(Date);
  });

  it("tandai tanpa aroma, lalu kembalikan ke belum dipetakan; setiap perubahan tercatat", async () => {
    const keluarga = await buatKeluarga();
    const kode = await buatProduk(kodeUnik("BOX-X"));
    await konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "terpetakan", idKeluarga: keluarga.id } }] });

    expect(await konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "tanpa-aroma" } }] })).toEqual({
      keadaan: "berhasil",
      hasil: [
        {
          kodeProduk: kode,
          status: "berhasil",
          dari: { status: "terpetakan", keluarga: { id: keluarga.id, nama: keluarga.nama } },
          ke: { status: "tanpa-aroma", keluarga: null },
        },
      ],
    });
    expect(await pemetaanProduk(kode)).toEqual({ status: "tanpa-aroma", idKeluarga: null });

    await konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "belum-dipetakan" } }] });
    expect(await pemetaanProduk(kode)).toEqual({ status: "belum-dipetakan", idKeluarga: null });

    expect((await riwayatProduk(kode)).map((r) => [r.dariStatus, r.keStatus])).toEqual([
      ["tanpa-aroma", "belum-dipetakan"],
      ["terpetakan", "tanpa-aroma"],
      ["belum-dipetakan", "terpetakan"],
    ]);
  });

  it("konfirmasi massal memberi hasil per produk, sesuai urutan", async () => {
    const keluarga = await buatKeluarga();
    const pertama = await buatProduk(kodeUnik("DD-HAM120-X"));
    const kedua = await buatProduk(kodeUnik("DW110E-X-R"));
    const sudahTanpaAroma = await buatProduk(kodeUnik("BOX-X"));
    await db.update(produk).set({ statusKeluargaAroma: "tanpa-aroma" }).where(eq(produk.kode, sudahTanpaAroma));
    const keTidakAda = await buatProduk(kodeUnik("DW110E-X"));
    const tidakAda = kodeUnik("TIDAK-ADA-X");

    const hasil = await konfirmasiPemetaan({
      butir: [
        { kodeProduk: pertama, tujuan: { status: "terpetakan", idKeluarga: keluarga.id } },
        { kodeProduk: tidakAda, tujuan: { status: "tanpa-aroma" } },
        { kodeProduk: kedua, tujuan: { status: "terpetakan", idKeluarga: keluarga.id } },
        { kodeProduk: sudahTanpaAroma, tujuan: { status: "tanpa-aroma" } },
        { kodeProduk: keTidakAda, tujuan: { status: "terpetakan", idKeluarga: 2_000_000_000 } },
      ],
    });
    const keKeluarga = { status: "terpetakan", keluarga: { id: keluarga.id, nama: keluarga.nama } };
    const dariBelum = { status: "belum-dipetakan", keluarga: null };
    expect(hasil).toEqual({
      keadaan: "berhasil",
      hasil: [
        { kodeProduk: pertama, status: "berhasil", dari: dariBelum, ke: keKeluarga },
        { kodeProduk: tidakAda, status: "gagal", pesan: "Produk tidak ditemukan." },
        { kodeProduk: kedua, status: "berhasil", dari: dariBelum, ke: keKeluarga },
        { kodeProduk: sudahTanpaAroma, status: "tidakBerubah", ke: { status: "tanpa-aroma", keluarga: null } },
        { kodeProduk: keTidakAda, status: "gagal", pesan: "Keluarga aroma tidak ditemukan." },
      ],
    });
    expect(await pemetaanProduk(pertama)).toEqual({ status: "terpetakan", idKeluarga: keluarga.id });
    expect(await pemetaanProduk(kedua)).toEqual({ status: "terpetakan", idKeluarga: keluarga.id });
    expect(await pemetaanProduk(keTidakAda)).toEqual({ status: "belum-dipetakan", idKeluarga: null });
    // Yang tidak berubah atau gagal tidak menambah riwayat.
    expect(await riwayatProduk(sudahTanpaAroma)).toEqual([]);
    expect(await riwayatProduk(keTidakAda)).toEqual([]);
  });

  it("isian tidak valid ditolak tanpa mengubah apa pun", async () => {
    expect(await konfirmasiPemetaan({ butir: [] })).toEqual({ keadaan: "gagal", pesan: "Pilih minimal satu produk." });
    const kode = await buatProduk(kodeUnik("DW110E-X"));
    expect(
      await konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "terpetakan" } }] }),
    ).toEqual({ keadaan: "gagal", pesan: "Pilih keluarga aroma." });
    expect(await konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "lain" } }] })).toEqual({
      keadaan: "gagal",
      pesan: "Pilih keluarga aroma, tanpa aroma, atau belum dipetakan.",
    });
    expect(await pemetaanProduk(kode)).toEqual({ status: "belum-dipetakan", idKeluarga: null });
  });

  it("tersimpan, tetapi gagal memuat ulang tampilan: hasil per produk tetap dikembalikan", async () => {
    kepala.muatUlangGagal = true;
    const kode = await buatProduk(kodeUnik("BOX-X"));
    const hasil = await konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: { status: "tanpa-aroma" } }] });
    expect(hasil).toMatchObject({ keadaan: "tersimpanGagalMuatUlang", hasil: [{ kodeProduk: kode, status: "berhasil" }] });
    expect(await pemetaanProduk(kode)).toEqual({ status: "tanpa-aroma", idKeluarga: null });
  });
});

describe("database menegakkan keluarga sesuai status", () => {
  it("terpetakan tanpa keluarga, atau keluarga tanpa status terpetakan, ditolak", async () => {
    const keluarga = await buatKeluarga();
    const kode = await buatProduk(kodeUnik("DW110E-X"));
    await expect(db.update(produk).set({ statusKeluargaAroma: "terpetakan" }).where(eq(produk.kode, kode))).rejects.toThrow();
    await expect(db.update(produk).set({ keluargaAromaId: keluarga.id }).where(eq(produk.kode, kode))).rejects.toThrow();
  });
});
