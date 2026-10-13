// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ gantiNamaGudang: vi.fn(), ubahStatusGudang: vi.fn() }));
vi.mock("./aksi", () => tiruan);

import {
  bukaDialogKonfirmasi,
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";

import { BarisGudang, type DataBarisGudang } from "./baris-gudang";

// T110: baris daftar gudang admin. Nonaktifkan lewat dialog konfirmasi (DESIGN §11.3, T109); ubah nama di baris itu;
// Pusat tanpa tombol ubah nama dan nonaktifkan, dengan keterangan.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const bandung: DataBarisGudang = { id: 3, nama: "Gudang Bandung", aktif: true, pusat: false, jumlahToko: 2 };

function pasang(gudang: DataBarisGudang) {
  return pasangUntukUji(
    <table>
      <tbody>
        <BarisGudang gudang={gudang} />
      </tbody>
    </table>,
  );
}

const tombol = (wadah: HTMLElement, nama: string) =>
  [...wadah.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === nama || b.textContent?.trim() === nama);
const status = (wadah: HTMLElement) => wadah.querySelector("[data-keadaan]");

beforeEach(() => {
  tiruan.gantiNamaGudang.mockReset();
  tiruan.ubahStatusGudang.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  lepasTerpasang();
  vi.unstubAllGlobals();
});

describe("baris gudang", () => {
  it("menampilkan nama, status Aktif, jumlah toko terhubung, dan tombol Ubah nama serta Nonaktifkan", () => {
    const wadah = pasang(bandung);
    expect(wadah.textContent).toContain("Gudang Bandung");
    expect(wadah.querySelector('[data-status="aktif"]')).not.toBeNull();
    expect(wadah.querySelectorAll("td")[2]?.textContent).toBe("2");
    expect(tombol(wadah, "Ubah nama Gudang Bandung")).toBeDefined();
    const nonaktifkan = tombol(wadah, "Nonaktifkan Gudang Bandung");
    expect(nonaktifkan?.className.split(" ")).toContain("border-destructive");
    expect(nonaktifkan?.className.split(" ")).not.toContain("bg-destructive");
  });

  it("Nonaktifkan meminta konfirmasi; Batal → tidak ada yang disimpan", async () => {
    const wadah = pasang(bandung);
    bukaDialogKonfirmasi(wadah, "Nonaktifkan Gudang Bandung");
    expect(judulDialogKonfirmasi()).toBe("Nonaktifkan Gudang Bandung?");
    expect(dialogKonfirmasi()?.textContent).toContain("Gudang nonaktif tidak muncul di pilihan kerja");
    expect(tombolDialogKonfirmasi("Nonaktifkan").className).toContain("bg-destructive");
    await pilihDiDialogKonfirmasi("Batal");
    expect(tiruan.ubahStatusGudang).not.toHaveBeenCalled();
    expect(status(wadah)).toBeNull();
  });

  it("dikonfirmasi → menonaktifkan; penolakan server (masih ada toko) tampil dekat tombol", async () => {
    tiruan.ubahStatusGudang.mockResolvedValue({
      keadaan: "gagal",
      pesan: "Gudang Bandung masih terhubung dengan 2 toko. Gudang hanya bisa dinonaktifkan jika tidak ada lagi toko yang terhubung.",
    });
    const wadah = pasang(bandung);
    bukaDialogKonfirmasi(wadah, "Nonaktifkan Gudang Bandung");
    await pilihDiDialogKonfirmasi("Nonaktifkan");
    expect(tiruan.ubahStatusGudang).toHaveBeenCalledWith({ idGudang: 3, aktif: false });
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("gagal");
    expect(status(wadah)?.textContent).toContain("masih terhubung dengan 2 toko");
  });

  it("gudang nonaktif: badge Nonaktif dan tombol Aktifkan", async () => {
    tiruan.ubahStatusGudang.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang({ ...bandung, aktif: false, jumlahToko: 0 });
    expect(wadah.querySelector('[data-status="nonaktif"]')?.textContent).toBe("Nonaktif");
    expect(tombol(wadah, "Nonaktifkan Gudang Bandung")).toBeUndefined();
    bukaDialogKonfirmasi(wadah, "Aktifkan Gudang Bandung");
    expect(judulDialogKonfirmasi()).toBe("Aktifkan Gudang Bandung?");
    await pilihDiDialogKonfirmasi("Aktifkan");
    expect(tiruan.ubahStatusGudang).toHaveBeenCalledWith({ idGudang: 3, aktif: true });
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("berhasil");
  });

  it("Ubah nama: isian nama di baris itu, Simpan nama mengirim nama baru, Batal mengembalikan nama lama", async () => {
    tiruan.gantiNamaGudang.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang(bandung);
    act(() => tombol(wadah, "Ubah nama Gudang Bandung")?.click());
    const isian = wadah.querySelector("input");
    expect(isian?.value).toBe("Gudang Bandung");
    expect(wadah.querySelector(`label[for="${isian?.id}"]`)?.textContent).toBe("Nama baru Gudang Bandung");

    act(() => tombol(wadah, "Batal")?.click());
    expect(wadah.querySelector("input")).toBeNull();
    expect(tiruan.gantiNamaGudang).not.toHaveBeenCalled();

    act(() => tombol(wadah, "Ubah nama Gudang Bandung")?.click());
    const isianBaru = wadah.querySelector("input");
    if (!isianBaru) throw new Error("Isian nama tidak ada.");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(isianBaru, "Gudang Bandung Timur");
      isianBaru.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => tombol(wadah, "Simpan nama")?.click());
    expect(tiruan.gantiNamaGudang).toHaveBeenCalledWith({ idGudang: 3, nama: "Gudang Bandung Timur" });
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("berhasil");
    expect(wadah.querySelector("input")).toBeNull();
  });

  it("Pusat: tanpa tombol ubah nama dan nonaktifkan, dengan keterangan", () => {
    const wadah = pasang({ id: 1, nama: "Pusat", aktif: true, pusat: true, jumlahToko: 0 });
    expect(wadah.querySelectorAll("button")).toHaveLength(0);
    expect(wadah.querySelector("[data-pusat-terkunci]")?.textContent).toBe("Gudang Pusat tidak bisa diganti nama atau dinonaktifkan");
  });
});
