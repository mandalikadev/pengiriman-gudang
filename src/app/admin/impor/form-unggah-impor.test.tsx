// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const tiruan = vi.hoisted(() => ({ mintaUrlUnggah: vi.fn(), daftarkanImpor: vi.fn(), segarkan: vi.fn() }));
vi.mock("./aksi", () => ({ mintaUrlUnggah: tiruan.mintaUrlUnggah, daftarkanImpor: tiruan.daftarkanImpor }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: tiruan.segarkan, push: () => {} }) }));

import { FormUnggahImpor } from "./form-unggah-impor";
import { RingkasanHasilDaftar } from "./ringkasan-hasil-daftar";

// T85 (PRD A1 ▶ Keputusan 2026-10-12, UAT kedua): beberapa sheet dicentang sekaligus, bulan impor per sheet terisi
// dari nama sheet, satu tahun impor, dan pemeriksaan sebelum file diunggah.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;
const fetchTiruan = vi.fn();

beforeEach(() => {
  tiruan.mintaUrlUnggah.mockReset().mockResolvedValue({ keadaan: "berhasil", kunci: "impor/uji", url: "http://storage.uji/unggah" });
  tiruan.daftarkanImpor.mockReset();
  tiruan.segarkan.mockReset();
  fetchTiruan.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchTiruan);
});

afterEach(() => {
  if (terpasang) {
    const { akar, wadah } = terpasang;
    act(() => akar.unmount());
    wadah.remove();
    terpasang = null;
  }
  vi.unstubAllGlobals();
});

function pasang(onTerkirim = vi.fn()) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() => akar.render(<FormUnggahImpor onTerkirim={onTerkirim} />));
  terpasang = { wadah, akar };
  return wadah;
}

function workbook(namaSheet: string[]) {
  const wb = XLSX.utils.book_new();
  for (const nama of namaSheet) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["SALES"]]), nama);
  return new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "penjualan.xlsx");
}

async function pilihFile(wadah: HTMLElement, file: File) {
  const input = wadah.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Input file tidak ada.");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await vi.waitFor(() => expect(wadah.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0));
}

function kotakCentang(wadah: HTMLElement, nama: string) {
  const kotak = [...wadah.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((k) => k.value === nama);
  if (!kotak) throw new Error(`Kotak centang ${nama} tidak ada.`);
  return kotak;
}

function centang(wadah: HTMLElement, nama: string) {
  act(() => kotakCentang(wadah, nama).click());
}

function pemilihBulan(wadah: HTMLElement, nama: string) {
  return wadah.querySelector<HTMLButtonElement>(`[role="combobox"][aria-label="Bulan impor ${nama}"]`);
}

/** Mengubah bulan lewat select bawaan yang menyertai Select Radix di dalam form (sama dengan isian otomatis browser). */
function ubahBulan(wadah: HTMLElement, nama: string, bulan: number) {
  const pemilih = pemilihBulan(wadah, nama);
  const asli = pemilih?.parentElement?.querySelector("select");
  if (!asli) throw new Error(`Pemilih bulan ${nama} tidak ada.`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(asli, String(bulan));
    asli.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function isiTahun(wadah: HTMLElement, tahun: string) {
  const input = [...wadah.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Tahun impor"))?.querySelector("input");
  if (!input) throw new Error("Isian tahun tidak ada.");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, tahun);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function kirim(wadah: HTMLElement) {
  const tombol = [...wadah.querySelectorAll("button")].find((b) => b.textContent === "Unggah dan proses");
  if (!tombol) throw new Error("Tombol kirim tidak ada.");
  await act(async () => tombol.click());
}

describe("pilihan sheet berupa kotak centang", () => {
  it("setiap sheet tampil sebagai kotak centang; sheet MP tidak bisa dipilih", async () => {
    const wadah = pasang();
    await pilihFile(wadah, workbook(["JUNI (S)", "JULI (S)", "MP PUSAT (S)", "BARDAT"]));
    const kotak = [...wadah.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map((k) => [k.value, k.disabled]);
    expect(kotak).toEqual([
      ["JUNI (S)", false],
      ["JULI (S)", false],
      ["MP PUSAT (S)", true],
      ["BARDAT", false],
    ]);
    expect(wadah.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(wadah.textContent).toContain("di luar cakupan saat ini");
  });

  it("bulan impor terisi dari nama sheet saat dicentang, bisa diubah, dan kosong jika nama bulan tidak dikenali", async () => {
    const wadah = pasang();
    await pilihFile(wadah, workbook(["JUNI (S)", "agustus (s)", "BARDAT"]));
    expect(pemilihBulan(wadah, "JUNI (S)")).toBeNull();

    centang(wadah, "JUNI (S)");
    centang(wadah, "agustus (s)");
    centang(wadah, "BARDAT");
    expect(pemilihBulan(wadah, "JUNI (S)")?.textContent).toBe("Juni");
    expect(pemilihBulan(wadah, "agustus (s)")?.textContent).toBe("Agustus");
    expect(pemilihBulan(wadah, "BARDAT")?.textContent).toBe("Pilih bulan");

    ubahBulan(wadah, "agustus (s)", 9);
    expect(pemilihBulan(wadah, "agustus (s)")?.textContent).toBe("September");

    centang(wadah, "JUNI (S)");
    expect(kotakCentang(wadah, "JUNI (S)").checked).toBe(false);
    expect(pemilihBulan(wadah, "JUNI (S)")).toBeNull();
  });
});

describe("pemeriksaan sebelum unggah", () => {
  it("dua sheet dengan bulan yang sama → pesan menyebut kedua sheet; file tidak diunggah", async () => {
    const wadah = pasang();
    await pilihFile(wadah, workbook(["JUNI (S)", "JULI (S)"]));
    centang(wadah, "JUNI (S)");
    centang(wadah, "JULI (S)");
    ubahBulan(wadah, "JULI (S)", 6);
    isiTahun(wadah, "2026");
    await kirim(wadah);

    expect(wadah.querySelector('[role="alert"]')?.textContent).toContain(
      "Sheet JUNI (S) dan JULI (S) sama-sama memakai bulan impor Juni 2026. Pilih bulan yang berbeda.",
    );
    expect(tiruan.mintaUrlUnggah).not.toHaveBeenCalled();
    expect(fetchTiruan).not.toHaveBeenCalled();
  });

  it("tanpa sheet, tahun tidak empat digit, atau sheet tanpa bulan → pesan; file tidak diunggah", async () => {
    const wadah = pasang();
    await pilihFile(wadah, workbook(["JUNI (S)", "BARDAT"]));
    isiTahun(wadah, "2026");
    await kirim(wadah);
    expect(wadah.querySelector('[role="alert"]')?.textContent).toContain("Pilih minimal satu sheet.");

    centang(wadah, "JUNI (S)");
    isiTahun(wadah, "26");
    await kirim(wadah);
    expect(wadah.querySelector('[role="alert"]')?.textContent).toContain("Isi tahun impor empat digit.");

    centang(wadah, "BARDAT");
    isiTahun(wadah, "2026");
    await kirim(wadah);
    expect(wadah.querySelector('[role="alert"]')?.textContent).toContain("Pilih bulan impor untuk sheet BARDAT.");
    expect(tiruan.mintaUrlUnggah).not.toHaveBeenCalled();
  });
});

describe("kirim", () => {
  it("file diunggah sekali, semua sheet terpilih didaftarkan dalam satu panggilan, lalu hasilnya diteruskan", async () => {
    const hasil = {
      keadaan: "berhasil",
      sheet: [
        { namaSheet: "JUNI (S)", keadaan: "berhasil", idImpor: 11 },
        { namaSheet: "JULI (S)", keadaan: "gagal", pesan: "Sheet ini dari file yang sama sudah didaftarkan sebagai impor." },
      ],
    };
    tiruan.daftarkanImpor.mockResolvedValue(hasil);
    const onTerkirim = vi.fn();
    const wadah = pasang(onTerkirim);
    const file = workbook(["JUNI (S)", "MP PUSAT (S)", "JULI (S)"]);
    await pilihFile(wadah, file);
    centang(wadah, "JULI (S)");
    centang(wadah, "JUNI (S)");
    isiTahun(wadah, "2026");
    await kirim(wadah);

    await vi.waitFor(() => expect(onTerkirim).toHaveBeenCalledWith(hasil));
    expect(tiruan.mintaUrlUnggah).toHaveBeenCalledTimes(1);
    expect(fetchTiruan).toHaveBeenCalledTimes(1);
    expect(fetchTiruan).toHaveBeenCalledWith("http://storage.uji/unggah", { method: "PUT", body: file });
    expect(tiruan.daftarkanImpor).toHaveBeenCalledTimes(1);
    // Urutan mengikuti urutan sheet di workbook.
    expect(tiruan.daftarkanImpor).toHaveBeenCalledWith({
      kunci: "impor/uji",
      namaFile: "penjualan.xlsx",
      tahunImpor: 2026,
      sheet: [
        { namaSheet: "JUNI (S)", bulanImpor: 6 },
        { namaSheet: "JULI (S)", bulanImpor: 7 },
      ],
    });
    expect(tiruan.segarkan).toHaveBeenCalled();
  });

  it("pendaftaran ditolak server → pesan gagal; hasil tidak diteruskan", async () => {
    tiruan.daftarkanImpor.mockResolvedValue({ keadaan: "gagal", pesan: "File belum ada di storage. Unggah ulang file-nya." });
    const onTerkirim = vi.fn();
    const wadah = pasang(onTerkirim);
    await pilihFile(wadah, workbook(["JUNI (S)"]));
    centang(wadah, "JUNI (S)");
    isiTahun(wadah, "2026");
    await kirim(wadah);
    await vi.waitFor(() =>
      expect(wadah.querySelector('[role="alert"]')?.textContent).toContain("File belum ada di storage. Unggah ulang file-nya."),
    );
    expect(onTerkirim).not.toHaveBeenCalled();
  });
});

describe("ringkasan hasil per sheet", () => {
  it("menampilkan sheet yang berhasil didaftarkan dan yang gagal beserta alasannya", () => {
    const wadah = document.createElement("div");
    document.body.append(wadah);
    const akar = createRoot(wadah);
    terpasang = { wadah, akar };
    act(() =>
      akar.render(
        <RingkasanHasilDaftar
          sheet={[
            { namaSheet: "JUNI (S)", keadaan: "berhasil", idImpor: 11 },
            { namaSheet: "MP PUSAT (S)", keadaan: "gagal", pesan: "Sheet MP di luar cakupan saat ini." },
          ]}
        />,
      ),
    );
    const teks = [...wadah.querySelectorAll("li")].map((li) => li.textContent);
    expect(teks).toEqual(["JUNI (S)Berhasil didaftarkan", "MP PUSAT (S)Gagal— Sheet MP di luar cakupan saat ini."]);
    expect(wadah.textContent).toContain("1 sheet berhasil didaftarkan, 1 gagal.");
  });
});
