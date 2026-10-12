import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTanggalBisnis, type KategoriDasar } from "./kalender";
import { hitungKebutuhanKirim } from "./pengiriman";
import { periksaJadwal, tanggalKirimBerikutnya, tanggalKirimMenurutJadwal, type Jadwal, type MasukanJadwal } from "./jadwal";

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

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; persiapanHari: number; panjangCakupan: number; tanggalCakupan: { tanggal: string }[]; kebutuhan: number };
};

/** Cakupan dan kebutuhan pengiriman `tanggal` menurut jadwal (p dan L dari jadwal), produk otomatis tanpa stok. */
function cakupanMenurutJadwal(jadwal: Jadwal, tanggal: string, rataRata: Partial<Record<KategoriDasar, number>>) {
  const hasil = cek(jadwal, tanggal);
  if (!hasil.kirim) throw new Error(`${tanggal} harus tanggal kirim`);
  const kirim = hitungKebutuhanKirim({
    tanggalKirim: parseTanggalBisnis(tanggal),
    persiapanHari: hasil.persiapanHari,
    panjangCakupan: hasil.panjangCakupan,
    toko: "UJI",
    daftarPerubahan: [],
    rataRata,
    produk: { kode: "PW110P-GOR", kategori: "PARFUM WANITA" },
    stokAkhir: null,
    persenBuffer: 20,
  });
  return {
    persiapanHari: hasil.persiapanHari,
    panjangCakupan: hasil.panjangCakupan,
    cakupan: kirim.cakupan.map((t) => t.tanggal),
    kebutuhan: kirim.kebutuhan.tersedia ? kirim.kebutuhan.kebutuhan : null,
  };
}

describe("panjang cakupan L = jarak ke tanggal kirim berikutnya (PRD A6 ▶ Revisi 2026-10-12, UAT ketiga)", () => {
  // SMB: 2× seminggu Senin (H), Kamis (H−1); rata-rata PW110P-GOR Senin–Kamis 5, Jumat 5, Sabtu 8, Minggu 7.
  const smb = jadwalValid({
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H" },
      { hari: "Kamis", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });
  const rataRataSmb = { "Senin–Kamis": 5, Jumat: 5, Sabtu: 8, Minggu: 7 };

  it("SMB kirim Senin 2026-10-19 → p = 0, L = 3, cakupan Senin–Rabu 19–21 Okt, kebutuhan 15", () => {
    expect(cakupanMenurutJadwal(smb, "2026-10-19", rataRataSmb)).toEqual({
      persiapanHari: 0,
      panjangCakupan: 3,
      cakupan: ["2026-10-19", "2026-10-20", "2026-10-21"],
      kebutuhan: 15,
    });
  });

  it("SMB kirim Kamis 2026-10-22 → p = 1, L = 4, cakupan Rabu–Minggu 21–25 Okt (melintasi akhir minggu), kebutuhan 30", () => {
    expect(cakupanMenurutJadwal(smb, "2026-10-22", rataRataSmb)).toEqual({
      persiapanHari: 1,
      panjangCakupan: 4,
      cakupan: ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
      kebutuhan: 30,
    });
  });

  it("LWB 3× seminggu Senin/Rabu/Jumat (H−1) → Senin L = 2, Rabu L = 2, Jumat L = 3", () => {
    const lwb = jadwalValid({
      pola: "3x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H-1" },
        { hari: "Rabu", persiapan: "H-1" },
        { hari: "Jumat", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(cek(lwb, "2026-10-12")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 2 });
    expect(cek(lwb, "2026-10-14")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 2 });
    expect(cek(lwb, "2026-10-16")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 3 });
    expect(cakupanMenurutJadwal(lwb, "2026-10-16", rataRataSmb).cakupan).toEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("1× seminggu Senin H−2 (golden jumlah-kirim.json) → L = 7, cakupan dan kebutuhan 56 tetap", () => {
    const mingguan = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Senin", persiapan: "H-2" }], tanggalJangkar: null });
    const { kasusCakupan } = golden;
    expect(cakupanMenurutJadwal(mingguan, kasusCakupan.tanggalKirim, golden.rataRata)).toEqual({
      persiapanHari: kasusCakupan.persiapanHari,
      panjangCakupan: kasusCakupan.panjangCakupan,
      cakupan: kasusCakupan.tanggalCakupan.map((t) => t.tanggal),
      kebutuhan: kasusCakupan.kebutuhan,
    });
  });

  it("dua mingguan BXC Rabu (H−1), jangkar 2026-10-14 → L = 14, cakupan 13–27 Okt", () => {
    const bxc = jadwalValid({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H-1" }], tanggalJangkar: "2026-10-14" });
    expect(cek(bxc, "2026-10-14")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    const { cakupan } = cakupanMenurutJadwal(bxc, "2026-10-14", rataRataSmb);
    expect(cakupan).toHaveLength(15);
    expect([cakupan[0], cakupan[14]]).toEqual(["2026-10-13", "2026-10-27"]);
    expect(cek(bxc, "2026-10-28")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
  });

  it("dua mingguan Senin + Kamis, jangkar pekan 2026-10-12 → Senin 12 Okt L = 3; Kamis 15 Okt L = 11 (berikutnya Senin 26 Okt)", () => {
    const duaHari = jadwalValid({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Kamis", persiapan: "H" },
      ],
      tanggalJangkar: "2026-10-12",
    });
    expect(cek(duaHari, "2026-10-12")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 3 });
    expect(cek(duaHari, "2026-10-15")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 11 });
    const { cakupan } = cakupanMenurutJadwal(duaHari, "2026-10-15", rataRataSmb);
    expect([cakupan[0], cakupan[cakupan.length - 1]]).toEqual(["2026-10-15", "2026-10-25"]);
  });
});

describe("tanggalKirimBerikutnya — tanggal kirim pertama sesudah tanggal itu menurut jadwal", () => {
  const smb = jadwalValid({
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H" },
      { hari: "Kamis", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });
  const berikutnya = (jadwal: Jadwal, tanggal: string) => tanggalKirimBerikutnya(jadwal, parseTanggalBisnis(tanggal));

  it("dari tanggal kirim: hari kirim berikutnya, melintasi akhir minggu", () => {
    expect(berikutnya(smb, "2026-10-19")).toBe("2026-10-22");
    expect(berikutnya(smb, "2026-10-22")).toBe("2026-10-26");
  });

  it("dari tanggal yang bukan tanggal kirim: hari kirim terdekat sesudahnya", () => {
    expect(berikutnya(smb, "2026-10-25")).toBe("2026-10-26");
    expect(berikutnya(smb, "2026-10-20")).toBe("2026-10-22");
  });

  it("mingguan: tujuh hari kemudian", () => {
    const mingguan = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Sabtu", persiapan: "H" }], tanggalJangkar: null });
    expect(berikutnya(mingguan, "2026-10-17")).toBe("2026-10-24");
  });

  it("dua mingguan: melewati pekan non-kirim", () => {
    const bxc = jadwalValid({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H-1" }], tanggalJangkar: "2026-10-14" });
    expect(berikutnya(bxc, "2026-10-14")).toBe("2026-10-28");
    expect(berikutnya(bxc, "2026-10-21")).toBe("2026-10-28");
    const duaHari = jadwalValid({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Kamis", persiapan: "H" },
      ],
      tanggalJangkar: "2026-10-12",
    });
    expect(berikutnya(duaHari, "2026-10-15")).toBe("2026-10-26");
    expect(berikutnya(duaHari, "2026-10-19")).toBe("2026-10-26");
  });
});

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

  it("dua hari kirim di pekan jangkar, masing-masing dengan persiapannya; L = jarak ke hari kirim berikutnya", () => {
    const duaHari = jadwalValid({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Selasa", persiapan: "H" },
        { hari: "Sabtu", persiapan: "H-2" },
      ],
      tanggalJangkar: "2026-06-10",
    });
    // Selasa → Sabtu pekan yang sama (4 hari); Sabtu → Selasa pekan kirim berikutnya, melewati pekan non-kirim (10 hari).
    expect(cek(duaHari, "2026-06-09")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 4 });
    expect(cek(duaHari, "2026-06-13")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 10 });
    expect(cek(duaHari, "2026-06-20").kirim).toBe(false);
    expect(cek(duaHari, "2026-06-27")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 10 });
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

  it("Senin/Rabu/Jumat → L = 2, 2, 3 (jarak ke hari kirim berikutnya), p sesuai hari masing-masing", () => {
    expect(cek(jadwal, "2026-06-08")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 2 });
    expect(cek(jadwal, "2026-06-10")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 2 });
    expect(cek(jadwal, "2026-06-12")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 3 });
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

  it("2× seminggu Selasa/Kamis → Selasa L = 2, Kamis L = 5 (melintasi akhir minggu)", () => {
    const jadwal = jadwalValid({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Selasa", persiapan: "H-1" },
        { hari: "Kamis", persiapan: "H-2" },
      ],
      tanggalJangkar: null,
    });
    expect(cek(jadwal, "2026-06-09")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 2 });
    expect(cek(jadwal, "2026-06-11")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 5 });
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
