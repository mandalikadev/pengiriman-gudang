import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang } from "@/server/db/schema";
import { buatTokoUji, gudangTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { tambahTokoKeGudang } from "./aksi";

let bali: number;
let bandung: number;

beforeAll(async () => {
  bali = await idGudangUji("Gudang Bali");
  bandung = await idGudangUji("Gudang Bandung");
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

describe("non-admin ditolak di server", () => {
  it("viewer yang memanggil aksi langsung ditolak dan tidak ada hubungan yang dibuat", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    const t = await buatTokoUji();
    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [t.id] })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await gudangTokoUji(t.id)).toEqual([]);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    const t = await buatTokoUji();
    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [t.id] })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
    expect(await gudangTokoUji(t.id)).toEqual([]);
  });
});

describe("admin menambah toko ke gudang", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  });

  it("menghubungkan toko yang belum terhubung", async () => {
    const t = await buatTokoUji();
    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [t.id] })).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [{ idToko: t.id, namaToko: t.nama, status: "berhasil", keterangan: "Ditambahkan ke Gudang Bali." }],
    });
    expect(await gudangTokoUji(t.id)).toEqual([bali]);
  });

  it("menghubungkan toko yang sudah terkait gudang lain ditolak; hubungan lamanya tetap", async () => {
    const t = await buatTokoUji();
    await tambahTokoKeGudang({ idGudang: bandung, idToko: [t.id] });

    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [t.id] })).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [
        {
          idToko: t.id,
          namaToko: t.nama,
          status: "terkaitGudangLain",
          keterangan: "Tidak ditambahkan: sudah terhubung ke Gudang Bandung. Satu toko hanya boleh terhubung ke satu gudang.",
        },
      ],
    });
    expect(await gudangTokoUji(t.id)).toEqual([bandung]);
  });

  it("tambah massal dengan campuran status menampilkan hasil per toko, sesuai urutan pilihan", async () => {
    const baru = await buatTokoUji();
    const sudah = await buatTokoUji();
    const nonaktif = await buatTokoUji({ aktif: false });
    const lain = await buatTokoUji();
    const baru2 = await buatTokoUji();
    await tambahTokoKeGudang({ idGudang: bali, idToko: [sudah.id] });
    await tambahTokoKeGudang({ idGudang: bandung, idToko: [lain.id] });

    const hasil = await tambahTokoKeGudang({
      idGudang: bali,
      idToko: [baru.id, sudah.id, nonaktif.id, lain.id, baru2.id],
    });
    expect(hasil).toEqual({
      keadaan: "berhasil",
      hasil: [
        { idToko: baru.id, namaToko: baru.nama, status: "berhasil", keterangan: "Ditambahkan ke Gudang Bali." },
        {
          idToko: sudah.id,
          namaToko: sudah.nama,
          status: "sudahTerhubung",
          keterangan: "Sudah terhubung ke Gudang Bali sebelumnya; tidak ada yang diubah.",
        },
        {
          idToko: nonaktif.id,
          namaToko: nonaktif.nama,
          status: "nonaktif",
          keterangan: "Tidak ditambahkan: toko berstatus nonaktif.",
        },
        {
          idToko: lain.id,
          namaToko: lain.nama,
          status: "terkaitGudangLain",
          keterangan: "Tidak ditambahkan: sudah terhubung ke Gudang Bandung. Satu toko hanya boleh terhubung ke satu gudang.",
        },
        { idToko: baru2.id, namaToko: baru2.nama, status: "berhasil", keterangan: "Ditambahkan ke Gudang Bali." },
      ],
    });
    expect(await gudangTokoUji(baru.id)).toEqual([bali]);
    expect(await gudangTokoUji(baru2.id)).toEqual([bali]);
    expect(await gudangTokoUji(nonaktif.id)).toEqual([]);
    expect(await gudangTokoUji(lain.id)).toEqual([bandung]);
  });

  it("dua admin menambah toko yang sama ke dua gudang bersamaan: hanya satu yang berhasil", async () => {
    const t = await buatTokoUji();
    const [keBali, keBandung] = await Promise.all([
      tambahTokoKeGudang({ idGudang: bali, idToko: [t.id] }),
      tambahTokoKeGudang({ idGudang: bandung, idToko: [t.id] }),
    ]);
    const status = [keBali, keBandung].map((h) => (h.keadaan === "gagal" ? h.keadaan : h.hasil[0].status)).sort();
    expect(status).toEqual(["berhasil", "terkaitGudangLain"]);
    expect(await gudangTokoUji(t.id)).toHaveLength(1);
  });

  it("tersimpan tetapi gagal memuat ulang tampilan: hasil per toko tetap dikembalikan", async () => {
    kepala.muatUlangGagal = true;
    const t = await buatTokoUji();
    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [t.id] })).resolves.toMatchObject({
      keadaan: "tersimpanGagalMuatUlang",
      hasil: [{ idToko: t.id, status: "berhasil" }],
    });
    expect(await gudangTokoUji(t.id)).toEqual([bali]);
  });

  it("isian tidak valid → gagal dengan pesan, tanpa menulis data", async () => {
    const t = await buatTokoUji();
    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [] })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Pilih minimal satu toko.",
    });
    await expect(tambahTokoKeGudang({ idGudang: -1, idToko: [t.id] })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Gudang tidak ditemukan.",
    });
    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [t.id, -1] })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Ada toko yang tidak ditemukan. Muat ulang halaman, lalu pilih lagi.",
    });
    await expect(tambahTokoKeGudang({ idGudang: "x", idToko: [t.id] })).resolves.toMatchObject({ keadaan: "gagal" });
    expect(await gudangTokoUji(t.id)).toEqual([]);
  });
});

describe("database menegakkan satu toko satu gudang (ADR-0009)", () => {
  it("baris hubungan kedua untuk toko yang sama ditolak database", async () => {
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: bandung });
    await expect(db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: bali })).rejects.toThrow();
    expect(await gudangTokoUji(t.id)).toEqual([bandung]);
  });
});
