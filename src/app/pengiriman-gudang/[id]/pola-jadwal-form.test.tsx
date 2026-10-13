// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./aksi", () => ({
  simpanJadwal: vi.fn(),
  nonaktifkanJadwal: vi.fn(),
  usulkanJadwal: vi.fn(),
  usulkanNonaktifJadwal: vi.fn(),
  salinJadwal: vi.fn(),
}));

import { FormJadwal } from "./form-jadwal";
import { FormSalinJadwal } from "./form-salin-jadwal";

// T92: pola 1× sebulan bisa dipilih di ketiga form jadwal (PRD A5 ▶ Keputusan 2026-10-12, UAT ketiga).

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

const daftarToko = [{ id: 1, nama: "TOKO UJI", jadwal: null, adaUsulanMenunggu: false }];

describe("pilihan pola 1× sebulan di form jadwal", () => {
  it("atur jadwal Pusat (langsung)", () => {
    expect(pilihanPola(tampilkan(<FormJadwal idGudang={1} jalur="langsung" daftarToko={daftarToko} idJudul="judul" />))).toEqual(SEMUA_POLA);
  });

  it("usulkan jadwal (gudang selain Pusat)", () => {
    expect(pilihanPola(tampilkan(<FormJadwal idGudang={2} jalur="usulan" daftarToko={daftarToko} idJudul="judul" />))).toEqual(SEMUA_POLA);
  });

  it("salin jadwal ke beberapa toko", () => {
    expect(pilihanPola(tampilkan(<FormSalinJadwal idGudang={2} jalur="usulan" daftarToko={[{ id: 1, nama: "TOKO UJI" }]} idJudul="judul" />))).toEqual(SEMUA_POLA);
  });
});
