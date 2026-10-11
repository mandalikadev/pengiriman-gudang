import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasNamaStok, produk } from "@/server/db/schema";
import { buatWorkbookUji } from "@/server/impor/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { hapusAliasStok, tambahAliasStok, unggahTabelAlias } from "./aksi";

// Contoh literal issue T82: master berisi dua produk GORGEOUS TUBEROSE. Database test dibuat ulang per putaran,
// jadi kode literal ini aman dipakai sekali di berkas ini.
const PW110P = { kode: "PW110P-GOR", nama: "GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE" };
const A10M = { kode: "A10M-GOR", nama: "GORGEOUS TUBEROSE - 10ML ATOMIZER" };

/** Alias unik per test: alias unik di seluruh database test. */
function unik(awalan: string) {
  return `${awalan} ${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function aliasTersimpan(alias: string) {
  const [baris] = await db.select().from(aliasNamaStok).where(eq(aliasNamaStok.alias, alias));
  return baris ?? null;
}

async function kirimFile(nama: string, isi: Buffer | string) {
  const form = new FormData();
  form.set("file", new File([typeof isi === "string" ? isi : new Uint8Array(isi)], nama));
  return unggahTabelAlias(form);
}

beforeAll(async () => {
  for (const p of [PW110P, A10M]) {
    await db
      .insert(produk)
      .values({ ...p, ukuran: "100ML", kategori: "PARFUM WANITA", klasifikasi: "otomatis" })
      .onConflictDoNothing();
  }
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

describe("non-admin ditolak di server sebelum membaca atau menulis", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
  });

  it("tambahAliasStok ditolak dan alias tidak tersimpan", async () => {
    const alias = unik("VIEWER");
    await expect(tambahAliasStok({ alias, kodeProduk: PW110P.kode })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await aliasTersimpan(alias)).toBeNull();
  });

  it("hapusAliasStok ditolak dan alias tetap ada", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const alias = unik("TETAP");
    await db.insert(aliasNamaStok).values({ alias, kodeProduk: PW110P.kode, dibuatOleh: admin.id });
    await expect(hapusAliasStok({ alias })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await aliasTersimpan(alias)).not.toBeNull();
  });

  it("unggahTabelAlias ditolak", async () => {
    const alias = unik("UNGGAH VIEWER");
    await expect(kirimFile("alias.csv", `Nama di file stok;Kode produk\n${alias};${PW110P.kode}\n`)).rejects.toBeInstanceOf(
      AksesDitolakError,
    );
    expect(await aliasTersimpan(alias)).toBeNull();
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    kepala.cookie = "";
    await expect(tambahAliasStok({ alias: unik("TANPA SESI"), kodeProduk: PW110P.kode })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });
});

describe("admin menambah dan menghapus satu alias", () => {
  let idAdmin = "";
  beforeEach(async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    idAdmin = admin.id;
  });

  it("alias disimpan setelah normalisasi (huruf besar, spasi dirapikan) untuk kode produk master", async () => {
    expect(await tambahAliasStok({ alias: "gorgeous  tuberose - 110ml m parfum", kodeProduk: PW110P.kode })).toEqual({
      keadaan: "berhasil",
    });
    expect(await aliasTersimpan("GORGEOUS TUBEROSE - 110ML M PARFUM")).toMatchObject({
      alias: "GORGEOUS TUBEROSE - 110ML M PARFUM",
      kodeProduk: PW110P.kode,
      dibuatOleh: idAdmin,
    });
  });

  it("kode produk yang tidak ada di master ditolak", async () => {
    const alias = unik("KODE ASING");
    expect(await tambahAliasStok({ alias, kodeProduk: "TIDAK-ADA" })).toEqual({
      keadaan: "gagal",
      pesan: "Kode produk TIDAK-ADA tidak dikenal.",
    });
    expect(await aliasTersimpan(alias)).toBeNull();
  });

  it("alias yang sudah ada untuk kode yang sama → sudah ada, tidak diubah", async () => {
    const alias = unik("SUDAH ADA");
    expect(await tambahAliasStok({ alias, kodeProduk: A10M.kode })).toEqual({ keadaan: "berhasil" });
    const sebelum = await aliasTersimpan(alias);
    expect(await tambahAliasStok({ alias: ` ${alias.toLowerCase()} `, kodeProduk: A10M.kode })).toEqual({
      keadaan: "gagal",
      pesan: `Alias ${alias} sudah ada untuk kode ${A10M.kode}; tidak diubah.`,
    });
    expect(await aliasTersimpan(alias)).toEqual(sebelum);
  });

  it("alias yang sudah dipakai produk lain ditolak dengan menyebut produk pemiliknya", async () => {
    const alias = unik("MILIK LAIN");
    expect(await tambahAliasStok({ alias, kodeProduk: A10M.kode })).toEqual({ keadaan: "berhasil" });
    expect(await tambahAliasStok({ alias, kodeProduk: PW110P.kode })).toEqual({
      keadaan: "gagal",
      pesan: `Alias ${alias} sudah dipakai produk ${A10M.kode} (${A10M.nama}).`,
    });
    expect(await aliasTersimpan(alias)).toMatchObject({ kodeProduk: A10M.kode });
  });

  it("alias yang sama dengan nama master produk lain (setelah normalisasi) ditolak dengan menyebut produk itu", async () => {
    expect(await tambahAliasStok({ alias: "gorgeous tuberose - 10ml  atomizer", kodeProduk: PW110P.kode })).toEqual({
      keadaan: "gagal",
      pesan: `Alias ${A10M.nama} sama dengan nama master produk ${A10M.kode} (${A10M.nama}).`,
    });
    expect(await aliasTersimpan(A10M.nama)).toBeNull();
  });

  it("alias kosong ditolak", async () => {
    expect(await tambahAliasStok({ alias: "   ", kodeProduk: PW110P.kode })).toEqual({
      keadaan: "gagal",
      pesan: "Alias wajib diisi.",
    });
  });

  it("tersimpan tetapi gagal memuat ulang tampilan → keadaan kelima", async () => {
    kepala.muatUlangGagal = true;
    const alias = unik("MUAT ULANG");
    expect(await tambahAliasStok({ alias, kodeProduk: PW110P.kode })).toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await aliasTersimpan(alias)).not.toBeNull();
  });

  it("hapus alias: baris hilang; alias yang tidak ada → gagal", async () => {
    const alias = unik("DIHAPUS");
    expect(await tambahAliasStok({ alias, kodeProduk: PW110P.kode })).toEqual({ keadaan: "berhasil" });
    expect(await hapusAliasStok({ alias })).toEqual({ keadaan: "berhasil" });
    expect(await aliasTersimpan(alias)).toBeNull();
    expect(await hapusAliasStok({ alias })).toEqual({ keadaan: "gagal", pesan: "Alias tidak ditemukan." });
  });
});

describe("admin mengunggah tabel alias", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  });

  /**
   * Contoh literal issue: 5 baris → 1 ditambahkan, 1 sudah ada, 1 kode tidak dikenal, 1 alias milik produk lain,
   * 1 ganda di file. Nomor baris = nomor baris file (baris 1 = judul kolom).
   */
  async function siapkanLimaBaris() {
    const baru = unik("BARU");
    const sudahAda = unik("SUDAH ADA");
    const milikLain = unik("MILIK LAIN");
    const kodeAsing = `ASING-${randomUUID().slice(0, 6).toUpperCase()}`;
    expect(await tambahAliasStok({ alias: sudahAda, kodeProduk: A10M.kode })).toEqual({ keadaan: "berhasil" });
    expect(await tambahAliasStok({ alias: milikLain, kodeProduk: A10M.kode })).toEqual({ keadaan: "berhasil" });
    const baris: [string, string][] = [
      [baru.toLowerCase(), PW110P.kode],
      [sudahAda, A10M.kode],
      [unik("ASING"), kodeAsing],
      [milikLain, PW110P.kode],
      [`${baru} `, A10M.kode],
    ];
    const diharapkan = [
      { nomor: 2, alias: baru, kodeProduk: PW110P.kode, keadaan: "ditambahkan" },
      { nomor: 3, alias: sudahAda, kodeProduk: A10M.kode, keadaan: "sudahAda" },
      { nomor: 4, alias: baris[2][0], kodeProduk: kodeAsing, keadaan: "ditolak", alasan: `Kode produk ${kodeAsing} tidak dikenal.` },
      {
        nomor: 5,
        alias: milikLain,
        kodeProduk: PW110P.kode,
        keadaan: "ditolak",
        alasan: `Alias ${milikLain} sudah dipakai produk ${A10M.kode} (${A10M.nama}).`,
      },
      { nomor: 6, alias: baru, kodeProduk: A10M.kode, keadaan: "ditolak", alasan: "Ganda di file baris 2." },
    ];
    return { baru, baris, diharapkan };
  }

  it("CSV berpemisah ; (kolom lain diabaikan, judul kolom dicocokkan setelah normalisasi)", async () => {
    const { baru, baris, diharapkan } = await siapkanLimaBaris();
    const csv = [
      "No;nama di  file stok;KODE PRODUK",
      ...baris.map(([alias, kode], i) => `${i + 1};${alias};${kode}`),
    ].join("\r\n");
    const hasil = await kirimFile("alias.csv", csv);
    expect(hasil).toEqual({
      keadaan: "berhasil",
      baris: diharapkan,
      jumlah: { ditambahkan: 1, sudahAda: 1, ditolak: 3 },
    });
    expect(await aliasTersimpan(baru)).toMatchObject({ kodeProduk: PW110P.kode });
  });

  it("workbook .xlsx (sheet pertama)", async () => {
    const { baru, baris, diharapkan } = await siapkanLimaBaris();
    const workbook = buatWorkbookUji({
      "Sheet1": [["Nama di file stok", "Kode produk"], ...baris],
      "Lain": [["Nama di file stok", "Kode produk"], ["TIDAK DIBACA", PW110P.kode]],
    });
    const hasil = await kirimFile("alias.xlsx", workbook);
    expect(hasil).toEqual({
      keadaan: "berhasil",
      baris: diharapkan,
      jumlah: { ditambahkan: 1, sudahAda: 1, ditolak: 3 },
    });
    expect(await aliasTersimpan(baru)).toMatchObject({ kodeProduk: PW110P.kode });
    expect(await aliasTersimpan("TIDAK DIBACA")).toBeNull();
  });

  it("alias kosong dan alias sama dengan nama master produk lain ditolak per baris; baris lain tetap diproses", async () => {
    const baru = unik("TETAP DIPROSES");
    const hasil = await kirimFile(
      "alias.csv",
      ["Nama di file stok;Kode produk", `;${PW110P.kode}`, `${A10M.nama};${PW110P.kode}`, `${baru};${PW110P.kode}`].join("\n"),
    );
    expect(hasil).toMatchObject({
      keadaan: "berhasil",
      baris: [
        { nomor: 2, keadaan: "ditolak", alasan: "Alias wajib diisi." },
        {
          nomor: 3,
          keadaan: "ditolak",
          alasan: `Alias ${A10M.nama} sama dengan nama master produk ${A10M.kode} (${A10M.nama}).`,
        },
        { nomor: 4, alias: baru, keadaan: "ditambahkan" },
      ],
      jumlah: { ditambahkan: 1, sudahAda: 0, ditolak: 2 },
    });
  });

  it("judul kolom tidak ditemukan → gagal, tidak ada yang disimpan", async () => {
    const alias = unik("TANPA JUDUL");
    expect(await kirimFile("alias.csv", `Nama;Kode\n${alias};${PW110P.kode}\n`)).toEqual({
      keadaan: "gagal",
      pesan: "Baris pertama harus memuat judul kolom Nama di file stok dan Kode produk.",
    });
    expect(await aliasTersimpan(alias)).toBeNull();
  });

  it("format selain CSV/.xlsx dan file lebih dari 1 MB ditolak", async () => {
    expect(await kirimFile("alias.txt", "Nama di file stok;Kode produk\n")).toEqual({
      keadaan: "gagal",
      pesan: "Format file harus CSV berpemisah ; atau .xlsx.",
    });
    expect(await kirimFile("alias.csv", "x".repeat(1_048_577))).toEqual({
      keadaan: "gagal",
      pesan: "File melebihi 1 MB.",
    });
  });

  it("tanpa file → gagal", async () => {
    expect(await unggahTabelAlias(new FormData())).toEqual({ keadaan: "gagal", pesan: "Pilih file tabel alias." });
  });
});
