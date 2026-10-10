import { describe, expect, it } from "vitest";

import { bandingkanDaftarLibur, periksaDaftarLibur, usulanJenisLibur } from "./libur";

describe("usulanJenisLibur (PRD B2, ▶ Keputusan perencanaan M2–M3)", () => {
  it('keterangan berisi "Cuti Bersama" → cuti bersama', () => {
    expect(usulanJenisLibur("Cuti Bersama Hari Raya Idul Fitri 1447 Hijriah")).toBe("cuti bersama");
    expect(usulanJenisLibur("Cuti Bersama Natal")).toBe("cuti bersama");
  });

  it("selain itu → libur nasional", () => {
    expect(usulanJenisLibur("Tahun Baru 2026 Masehi")).toBe("libur nasional");
    expect(usulanJenisLibur("Hari Raya Idul Fitri 1447 Hijriah")).toBe("libur nasional");
  });
});

describe("periksaDaftarLibur (PRD B2: validasi tanggal, tahun, duplikasi)", () => {
  it("daftar kosong → tidak valid (PRD B2, ▶ Keputusan 2026-10-10, T40)", () => {
    expect(periksaDaftarLibur(2026, [])).toEqual({
      keadaan: "tidakValid",
      pesan: "Daftar libur tahun 2026 kosong; tidak ada tanggal libur yang bisa disimpan.",
    });
  });

  it("daftar valid → entri dengan usulan jenis, urutan dipertahankan", () => {
    expect(
      periksaDaftarLibur(2026, [
        { tanggal: "2026-01-01", keterangan: "Tahun Baru 2026 Masehi" },
        { tanggal: "2026-03-20", keterangan: "Cuti Bersama Hari Raya Idul Fitri 1447 Hijriah" },
      ]),
    ).toEqual({
      keadaan: "valid",
      entri: [
        { tanggal: "2026-01-01", keterangan: "Tahun Baru 2026 Masehi", jenis: "libur nasional" },
        { tanggal: "2026-03-20", keterangan: "Cuti Bersama Hari Raya Idul Fitri 1447 Hijriah", jenis: "cuti bersama" },
      ],
    });
  });

  it("tanggal bukan YYYY-MM-DD → tidak valid", () => {
    expect(periksaDaftarLibur(2026, [{ tanggal: "01-01-2026", keterangan: "Tahun Baru" }])).toEqual({
      keadaan: "tidakValid",
      pesan: 'Entri ke-1: tanggal "01-01-2026" bukan tanggal YYYY-MM-DD yang ada di kalender.',
    });
  });

  it("tanggal yang tidak ada di kalender → tidak valid", () => {
    expect(
      periksaDaftarLibur(2026, [
        { tanggal: "2026-01-01", keterangan: "Tahun Baru" },
        { tanggal: "2026-02-30", keterangan: "Tidak ada" },
      ]),
    ).toEqual({
      keadaan: "tidakValid",
      pesan: 'Entri ke-2: tanggal "2026-02-30" bukan tanggal YYYY-MM-DD yang ada di kalender.',
    });
  });

  it("tanggal di luar tahun yang dipilih → tidak valid", () => {
    expect(periksaDaftarLibur(2026, [{ tanggal: "2025-12-25", keterangan: "Hari Raya Natal" }])).toEqual({
      keadaan: "tidakValid",
      pesan: "Entri ke-1: tanggal 2025-12-25 bukan tahun 2026 yang dipilih.",
    });
  });

  it("tanggal yang sama muncul dua kali → tidak valid", () => {
    expect(
      periksaDaftarLibur(2026, [
        { tanggal: "2026-03-20", keterangan: "Hari Raya Idul Fitri" },
        { tanggal: "2026-03-21", keterangan: "Hari Raya Idul Fitri" },
        { tanggal: "2026-03-20", keterangan: "Cuti Bersama Idul Fitri" },
      ]),
    ).toEqual({
      keadaan: "tidakValid",
      pesan: "Entri ke-3: tanggal 2026-03-20 muncul lebih dari sekali.",
    });
  });

  it("keterangan disimpan apa adanya, tanpa dipangkas", () => {
    expect(periksaDaftarLibur(2026, [{ tanggal: "2026-01-01", keterangan: " Tahun Baru " }])).toEqual({
      keadaan: "valid",
      entri: [{ tanggal: "2026-01-01", keterangan: " Tahun Baru ", jenis: "libur nasional" }],
    });
  });
});

describe("bandingkanDaftarLibur (PRD B3: perubahan dibandingkan daftar aktif)", () => {
  const aktif = [
    { tanggal: "2026-01-01", keterangan: "Tahun Baru", jenis: "libur nasional" },
    { tanggal: "2026-03-20", keterangan: "Idul Fitri", jenis: "libur nasional" },
    { tanggal: "2026-03-23", keterangan: "Cuti Bersama Idul Fitri", jenis: "cuti bersama" },
    { tanggal: "2026-12-25", keterangan: "Natal", jenis: "libur nasional" },
  ] as const;

  it("ditambah, dihapus, dan berubah (nama atau jenis), urut tanggal; yang sama tidak dilaporkan", () => {
    const baru = [
      { tanggal: "2026-12-25", keterangan: "Hari Raya Natal", jenis: "libur nasional" },
      { tanggal: "2026-01-01", keterangan: "Tahun Baru", jenis: "libur nasional" },
      { tanggal: "2026-03-23", keterangan: "Cuti Bersama Idul Fitri", jenis: "libur nasional" },
      { tanggal: "2026-08-17", keterangan: "Kemerdekaan", jenis: "libur nasional" },
    ] as const;
    expect(bandingkanDaftarLibur(aktif, baru)).toEqual([
      { perubahan: "dihapus", tanggal: "2026-03-20", sebelum: { keterangan: "Idul Fitri", jenis: "libur nasional" }, sesudah: null },
      {
        perubahan: "berubah",
        tanggal: "2026-03-23",
        sebelum: { keterangan: "Cuti Bersama Idul Fitri", jenis: "cuti bersama" },
        sesudah: { keterangan: "Cuti Bersama Idul Fitri", jenis: "libur nasional" },
      },
      { perubahan: "ditambah", tanggal: "2026-08-17", sebelum: null, sesudah: { keterangan: "Kemerdekaan", jenis: "libur nasional" } },
      {
        perubahan: "berubah",
        tanggal: "2026-12-25",
        sebelum: { keterangan: "Natal", jenis: "libur nasional" },
        sesudah: { keterangan: "Hari Raya Natal", jenis: "libur nasional" },
      },
    ]);
  });

  it("daftar sama → tidak ada perubahan; tanpa daftar aktif → semua ditambah", () => {
    expect(bandingkanDaftarLibur(aktif, aktif)).toEqual([]);
    expect(bandingkanDaftarLibur([], [aktif[0]])).toEqual([
      { perubahan: "ditambah", tanggal: "2026-01-01", sebelum: null, sesudah: { keterangan: "Tahun Baru", jenis: "libur nasional" } },
    ]);
  });
});
