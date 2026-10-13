// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../aksi", () => ({
  aturJadwalTetapToko: vi.fn(),
  nonaktifkanJadwalTetapToko: vi.fn(),
}));

import { isianTerkirim } from "@/app/pengiriman-gudang/[id]/bidang-jadwal";

import { FormJadwalTetap } from "./form-jadwal-tetap";

// T92: pola 1× sebulan bisa dipilih di form jadwal (PRD A5 ▶ Keputusan 2026-10-12, UAT ketiga). Form jadwal operator
// dihapus (T113); jadwal tetap diatur admin di halaman Jadwal toko (T112), jadi pilihan pola dan hari diuji di form admin.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function tampilkan(isi: ReactNode) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() => akar.render(isi));
  terpasang = { wadah, akar };
  return wadah;
}

afterEach(() => {
  if (terpasang !== null) {
    const { wadah, akar } = terpasang;
    act(() => akar.unmount());
    wadah.remove();
    terpasang = null;
  }
});

/** Pilihan pola (nilai dan teks) dari select bawaan Radix yang mendampingi kontrol Pola di dalam form. */
function pilihanPola(wadah: HTMLElement) {
  const select = [...wadah.querySelectorAll("select")].find((s) => s.querySelector('option[value="mingguan"]') !== null);
  if (select === undefined) throw new Error("Kontrol Pola tidak ada.");
  return [...select.options].map((o) => [o.value, o.textContent]);
}

const SEMUA_POLA = [
  ["mingguan", "Mingguan"],
  ["2x-seminggu", "2× seminggu"],
  ["3x-seminggu", "3× seminggu"],
  ["dua-mingguan", "Dua mingguan"],
  ["1x-sebulan", "1× sebulan"],
];

const toko = { id: 1, nama: "TOKO UJI", jadwal: null };

describe("pilihan pola 1× sebulan di form jadwal tetap", () => {
  it("form jadwal tetap admin menampilkan semua pola", () => {
    expect(pilihanPola(tampilkan(<FormJadwalTetap idGudang={1} toko={toko} />))).toEqual(SEMUA_POLA);
  });
});

// T106: hari Minggu bisa dipilih sebagai hari kirim (PRD A5 ▶ Revisi 2026-10-13, pemilik).
const TUJUH_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

/** Nilai checkbox hari kirim, dalam urutan tampil. */
function pilihanHari(wadah: HTMLElement) {
  return [...wadah.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="hariKirim"]')].map((c) => c.value);
}

describe("hari kirim Senin–Minggu di form jadwal tetap", () => {
  it("form jadwal tetap admin menampilkan tujuh hari berurutan Senin–Minggu", () => {
    expect(pilihanHari(tampilkan(<FormJadwalTetap idGudang={1} toko={toko} />))).toEqual(TUJUH_HARI);
  });

  it("isianTerkirim mempertahankan Minggu dan mengurutkan hari Senin–Minggu", () => {
    expect(
      isianTerkirim({
        pola: "2x-seminggu",
        hariKirim: [
          { hari: "Minggu", persiapan: "H-1" },
          { hari: "Kamis", persiapan: "H" },
        ],
        tanggalJangkar: null,
      }),
    ).toEqual({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Kamis", persiapan: "H" },
        { hari: "Minggu", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
  });
});
