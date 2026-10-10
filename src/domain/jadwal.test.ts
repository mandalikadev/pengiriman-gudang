import { describe, expect, it } from "vitest";
import { parseTanggalBisnis } from "./kalender";
import { periksaJadwal, tanggalKirimMenurutJadwal, type Jadwal, type MasukanJadwal } from "./jadwal";

function jadwalValid(masukan: MasukanJadwal): Jadwal {
  const hasil = periksaJadwal(masukan);
  if (hasil.keadaan !== "valid") {
    throw new Error(`jadwal contoh harus valid: ${hasil.pesan.join("; ")}`);
  }
  return hasil.jadwal;
}

function cek(jadwal: Jadwal, tanggal: string) {
  return tanggalKirimMenurutJadwal(jadwal, parseTanggalBisnis(tanggal));
}

describe("tanggalKirimMenurutJadwal — dua mingguan (PRD A5 ▶ Keputusan pekan jangkar)", () => {
  const jadwal = jadwalValid({
    pola: "dua-mingguan",
    hariKirim: [{ hari: "Senin", persiapan: "H-1" }],
    tanggalJangkar: "2026-06-10",
  });

  it("jangkar Rabu 2026-06-10, hari Senin → kirim 2026-06-08 dan 2026-06-22, bukan 2026-06-15", () => {
    expect(cek(jadwal, "2026-06-08")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-06-22")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-06-15")).toEqual({ kirim: false });
  });

  it("berulang setiap 14 hari: 2026-07-06 kirim, 2026-06-29 tidak", () => {
    expect(cek(jadwal, "2026-07-06").kirim).toBe(true);
    expect(cek(jadwal, "2026-06-29").kirim).toBe(false);
  });

  it("pola berlaku ke belakang dari jangkar: 2026-05-25 kirim, 2026-06-01 tidak (PRD A5 ▶ Keputusan 2026-10-10)", () => {
    expect(cek(jadwal, "2026-05-25")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-06-01")).toEqual({ kirim: false });
  });

  it("jauh sebelum jangkar tetap mengikuti pola 14 hari: 2026-05-11 kirim, 2026-05-18 tidak", () => {
    expect(cek(jadwal, "2026-05-11").kirim).toBe(true);
    expect(cek(jadwal, "2026-05-18").kirim).toBe(false);
  });

  it("hari selain hari kirim di pekan jangkar bukan tanggal kirim", () => {
    expect(cek(jadwal, "2026-06-10").kirim).toBe(false);
  });

  it("dua hari kirim di pekan jangkar, masing-masing dengan persiapannya", () => {
    const duaHari = jadwalValid({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Selasa", persiapan: "H" },
        { hari: "Sabtu", persiapan: "H-2" },
      ],
      tanggalJangkar: "2026-06-10",
    });
    expect(cek(duaHari, "2026-06-09")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 14 });
    expect(cek(duaHari, "2026-06-13")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 14 });
    expect(cek(duaHari, "2026-06-20").kirim).toBe(false);
    expect(cek(duaHari, "2026-06-27")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 14 });
  });
});

describe("tanggalKirimMenurutJadwal — 3× seminggu", () => {
  const jadwal = jadwalValid({
    pola: "3x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H-2" },
      { hari: "Rabu", persiapan: "H" },
      { hari: "Jumat", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });

  it("Senin/Rabu/Jumat → L = 7 untuk ketiganya, p sesuai hari masing-masing", () => {
    expect(cek(jadwal, "2026-06-08")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-06-10")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-06-12")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 7 });
  });

  it("hari lain bukan tanggal kirim; berlaku setiap pekan", () => {
    expect(cek(jadwal, "2026-06-09")).toEqual({ kirim: false });
    expect(cek(jadwal, "2026-06-14")).toEqual({ kirim: false });
    expect(cek(jadwal, "2026-06-15").kirim).toBe(true);
  });
});

describe("tanggalKirimMenurutJadwal — mingguan dan 2× seminggu", () => {
  it("mingguan Sabtu → setiap Sabtu, L = 7", () => {
    const jadwal = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Sabtu", persiapan: "H" }], tanggalJangkar: null });
    expect(cek(jadwal, "2026-06-13")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-06-20")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-06-12").kirim).toBe(false);
  });

  it("2× seminggu Selasa/Kamis → L = 7", () => {
    const jadwal = jadwalValid({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Selasa", persiapan: "H-1" },
        { hari: "Kamis", persiapan: "H-2" },
      ],
      tanggalJangkar: null,
    });
    expect(cek(jadwal, "2026-06-09")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-06-11")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 7 });
  });
});

describe("periksaJadwal — validasi", () => {
  it("menolak hari Minggu", () => {
    const hasil = periksaJadwal({ pola: "mingguan", hariKirim: [{ hari: "Minggu", persiapan: "H" }], tanggalJangkar: null });
    expect(hasil).toEqual({ keadaan: "tidakValid", pesan: ["Hari Minggu tidak bisa dipilih sebagai hari kirim. Pilih Senin–Sabtu."] });
  });

  it("menolak dua mingguan tanpa tanggal jangkar", () => {
    const hasil = periksaJadwal({ pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null });
    expect(hasil).toEqual({ keadaan: "tidakValid", pesan: ["Pola dua mingguan wajib memiliki tanggal jangkar."] });
  });

  it("menolak tanggal jangkar yang tidak valid", () => {
    const hasil = periksaJadwal({ pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: "2026-02-30" });
    expect(hasil).toEqual({ keadaan: "tidakValid", pesan: ['Tanggal jangkar tidak valid: "2026-02-30".'] });
  });

  it("menolak jumlah hari yang tidak sesuai pola", () => {
    expect(periksaJadwal({ pola: "mingguan", hariKirim: [], tanggalJangkar: null })).toEqual({
      keadaan: "tidakValid",
      pesan: ["Pola mingguan membutuhkan tepat 1 hari kirim, dipilih 0."],
    });
    expect(
      periksaJadwal({
        pola: "2x-seminggu",
        hariKirim: [{ hari: "Senin", persiapan: "H" }],
        tanggalJangkar: null,
      }),
    ).toEqual({ keadaan: "tidakValid", pesan: ["Pola 2× seminggu membutuhkan tepat 2 hari kirim, dipilih 1."] });
    expect(
      periksaJadwal({
        pola: "3x-seminggu",
        hariKirim: [
          { hari: "Senin", persiapan: "H" },
          { hari: "Rabu", persiapan: "H" },
        ],
        tanggalJangkar: null,
      }),
    ).toEqual({ keadaan: "tidakValid", pesan: ["Pola 3× seminggu membutuhkan tepat 3 hari kirim, dipilih 2."] });
    expect(periksaJadwal({ pola: "dua-mingguan", hariKirim: [], tanggalJangkar: "2026-06-10" })).toEqual({
      keadaan: "tidakValid",
      pesan: ["Pola dua mingguan membutuhkan minimal 1 hari kirim, dipilih 0."],
    });
  });

  it("menolak hari kirim yang dipilih dua kali", () => {
    const hasil = periksaJadwal({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Senin", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(hasil).toEqual({ keadaan: "tidakValid", pesan: ["Hari Senin dipilih lebih dari sekali."] });
  });

  it("mengumpulkan semua pesan sekaligus", () => {
    const hasil = periksaJadwal({ pola: "dua-mingguan", hariKirim: [{ hari: "Minggu", persiapan: "H" }], tanggalJangkar: null });
    expect(hasil).toEqual({
      keadaan: "tidakValid",
      pesan: ["Hari Minggu tidak bisa dipilih sebagai hari kirim. Pilih Senin–Sabtu.", "Pola dua mingguan wajib memiliki tanggal jangkar."],
    });
  });
});
