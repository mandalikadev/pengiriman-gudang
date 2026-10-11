// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ ubahStatusToko: vi.fn() }));
vi.mock("./aksi", () => ({ ubahStatusToko: tiruan.ubahStatusToko }));

import { pesanBelumPasti } from "@/components/keadaan-simpan";

import { TombolStatusToko } from "./tombol-status-toko";

// T76: admin mengaktifkan/menonaktifkan toko dari master toko. Konfirmasi dulu, lalu keadaan simpan dekat tombolnya.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function buka(aktif: boolean) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() => akar.render(<TombolStatusToko idToko={7} namaToko="LMK" aktif={aktif} />));
  terpasang = { wadah, akar };
  return wadah;
}

const tombol = (wadah: HTMLElement) => {
  const elemen = wadah.querySelector<HTMLButtonElement>("button");
  if (elemen === null) throw new Error("Tombol tidak ada.");
  return elemen;
};
const status = (wadah: HTMLElement) => wadah.querySelector("[data-keadaan]");

async function tekan(wadah: HTMLElement) {
  await act(async () => {
    tombol(wadah).click();
  });
}

let konfirmasi: ReturnType<typeof vi.fn<(pesan?: string) => boolean>>;

beforeEach(() => {
  tiruan.ubahStatusToko.mockReset();
  konfirmasi = vi.fn<(pesan?: string) => boolean>(() => true);
  vi.stubGlobal("confirm", konfirmasi);
});

afterEach(() => {
  if (terpasang) {
    const { wadah, akar } = terpasang;
    act(() => akar.unmount());
    wadah.remove();
    terpasang = null;
  }
  vi.unstubAllGlobals();
});

describe("tombol aktif/nonaktif toko", () => {
  it("toko aktif: tombol Nonaktifkan; tidak mengirim form tambah toko", () => {
    const wadah = buka(true);
    expect(tombol(wadah).textContent).toBe("Nonaktifkan");
    expect(tombol(wadah).getAttribute("aria-label")).toBe("Nonaktifkan LMK");
    expect(tombol(wadah).type).toBe("button");
    expect(status(wadah)).toBeNull();
  });

  it("toko nonaktif: tombol Aktifkan", () => {
    const wadah = buka(false);
    expect(tombol(wadah).textContent).toBe("Aktifkan");
    expect(tombol(wadah).getAttribute("aria-label")).toBe("Aktifkan LMK");
  });

  it("konfirmasi muncul sebelum simpan; dibatalkan → tidak ada yang disimpan", async () => {
    konfirmasi.mockReturnValue(false);
    const wadah = buka(true);
    await tekan(wadah);
    expect(konfirmasi).toHaveBeenCalledTimes(1);
    expect(konfirmasi.mock.calls[0][0]).toContain("Nonaktifkan toko LMK?");
    expect(tiruan.ubahStatusToko).not.toHaveBeenCalled();
    expect(status(wadah)).toBeNull();
  });

  it("dikonfirmasi → menonaktifkan; sedang menyimpan lalu berhasil tampil dekat tombol", async () => {
    let selesai: (hasil: { keadaan: "berhasil" }) => void = () => {};
    tiruan.ubahStatusToko.mockReturnValue(new Promise((r) => (selesai = r)));
    const wadah = buka(true);
    await tekan(wadah);
    expect(konfirmasi).toHaveBeenCalledBefore(tiruan.ubahStatusToko);
    expect(tiruan.ubahStatusToko).toHaveBeenCalledWith({ idToko: 7, aktif: false });
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("menyimpan");
    expect(tombol(wadah).disabled).toBe(true);

    await act(async () => selesai({ keadaan: "berhasil" }));
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("berhasil");
    expect(status(wadah)?.textContent).toBe("Berhasil disimpan");
    expect(tombol(wadah).disabled).toBe(false);
  });

  it("toko nonaktif dikonfirmasi → mengaktifkan", async () => {
    tiruan.ubahStatusToko.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = buka(false);
    await tekan(wadah);
    expect(konfirmasi.mock.calls[0][0]).toContain("Aktifkan toko LMK?");
    expect(tiruan.ubahStatusToko).toHaveBeenCalledWith({ idToko: 7, aktif: true });
  });

  it("gagal: pesan alasan tampil", async () => {
    tiruan.ubahStatusToko.mockResolvedValue({ keadaan: "gagal", pesan: "Toko tidak ditemukan. Muat ulang halaman." });
    const wadah = buka(true);
    await tekan(wadah);
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("gagal");
    expect(status(wadah)?.textContent).toBe("Gagal — Toko tidak ditemukan. Muat ulang halaman.");
  });

  it("tersimpan tetapi gagal memuat ulang: keadaan kelima tampil", async () => {
    tiruan.ubahStatusToko.mockResolvedValue({ keadaan: "tersimpanGagalMuatUlang" });
    const wadah = buka(true);
    await tekan(wadah);
    expect(status(wadah)?.textContent).toBe("Perubahan tersimpan. Muat ulang halaman untuk melihatnya.");
  });

  it("hasil belum pasti (jaringan putus): tidak diulang otomatis, tampil cara memeriksanya", async () => {
    tiruan.ubahStatusToko.mockRejectedValue(new TypeError("Failed to fetch"));
    const wadah = buka(true);
    await tekan(wadah);
    expect(tiruan.ubahStatusToko).toHaveBeenCalledTimes(1);
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("gagal");
    expect(status(wadah)?.textContent).toBe(`Gagal — ${pesanBelumPasti("status toko di daftar toko")}`);
  });
});
