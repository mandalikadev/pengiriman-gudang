// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ nonaktifkanJadwal: vi.fn(), usulkanNonaktifJadwal: vi.fn() }));
vi.mock("./aksi", () => ({
  simpanJadwal: vi.fn(),
  nonaktifkanJadwal: tiruan.nonaktifkanJadwal,
  usulkanJadwal: vi.fn(),
  usulkanNonaktifJadwal: tiruan.usulkanNonaktifJadwal,
}));

import {
  bukaDialogKonfirmasi,
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";

import { FormJadwal, type JalurJadwal } from "./form-jadwal";

// T109 (DESIGN §11.3): menonaktifkan jadwal meminta konfirmasi lewat dialog konfirmasi. Batal tidak mengubah data;
// "Nonaktifkan" menjalankan aksi yang sama seperti sebelumnya.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const daftarToko = [
  {
    id: 5,
    nama: "TOKO UJI",
    jadwal: { pola: "mingguan" as const, hariKirim: [{ hari: "Senin" as const, persiapan: "H-1" as const }], tanggalJangkar: null },
    adaUsulanMenunggu: false,
  },
];

function pasang(jalur: JalurJadwal) {
  const wadah = pasangUntukUji(<FormJadwal idGudang={1} jalur={jalur} daftarToko={daftarToko} idJudul="judul" />);
  // Memilih toko lewat select bawaan yang mendampingi kontrol Toko Radix di dalam form.
  const select = [...wadah.querySelectorAll("select")].find((s) => s.querySelector('option[value="5"]') !== null);
  if (select === undefined) throw new Error("Kontrol Toko tidak ada.");
  act(() => {
    select.value = "5";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return wadah;
}

beforeEach(() => {
  tiruan.nonaktifkanJadwal.mockReset();
  tiruan.usulkanNonaktifJadwal.mockReset();
});

afterEach(lepasTerpasang);

describe("nonaktifkan jadwal (jalur langsung)", () => {
  it("membuka dialog konfirmasi; Batal tidak menonaktifkan", async () => {
    const wadah = pasang("langsung");
    bukaDialogKonfirmasi(wadah, "Nonaktifkan jadwal");
    expect(judulDialogKonfirmasi()).toBe("Nonaktifkan jadwal TOKO UJI?");
    expect(dialogKonfirmasi()?.textContent).toContain("Toko ini tidak lagi punya jadwal aktif.");
    expect(tombolDialogKonfirmasi("Nonaktifkan").className).toContain("bg-destructive");
    await pilihDiDialogKonfirmasi("Batal");
    expect(dialogKonfirmasi()).toBeNull();
    expect(tiruan.nonaktifkanJadwal).not.toHaveBeenCalled();
    // Keadaan tetap "belum disimpan" dari memilih toko; tidak ada yang sedang disimpan.
    expect(wadah.querySelector("[data-keadaan]")?.getAttribute("data-keadaan")).toBe("belumDisimpan");
  });

  it("Nonaktifkan menjalankan aksi nonaktifkan jadwal toko itu", async () => {
    tiruan.nonaktifkanJadwal.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang("langsung");
    bukaDialogKonfirmasi(wadah, "Nonaktifkan jadwal");
    await pilihDiDialogKonfirmasi("Nonaktifkan");
    expect(tiruan.nonaktifkanJadwal).toHaveBeenCalledWith({ idGudang: 1, idToko: 5 });
    expect(wadah.querySelector("[data-keadaan]")?.getAttribute("data-keadaan")).toBe("berhasil");
  });
});

describe("usulkan penonaktifan (jalur usulan)", () => {
  it("hanya usulan yang menunggu persetujuan admin, jadi langsung dikirim tanpa dialog", async () => {
    tiruan.usulkanNonaktifJadwal.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang("usulan");
    await act(async () => bukaDialogKonfirmasi(wadah, "Usulkan penonaktifan"));
    expect(dialogKonfirmasi()).toBeNull();
    expect(tiruan.usulkanNonaktifJadwal).toHaveBeenCalledWith({ idGudang: 1, idToko: 5 });
  });
});
