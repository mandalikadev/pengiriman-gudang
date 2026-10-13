// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ ubahStatusToko: vi.fn() }));
vi.mock("./aksi", () => ({ ubahStatusToko: tiruan.ubahStatusToko }));

import { pesanBelumPasti } from "@/components/keadaan-simpan";
import {
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";

import { TombolStatusToko } from "./tombol-status-toko";

// T76: admin mengaktifkan/menonaktifkan toko dari master toko. Konfirmasi dulu, lalu keadaan simpan dekat tombolnya.
// T109 (DESIGN §11.3): konfirmasi lewat dialog konfirmasi aplikasi, bukan `window.confirm`.

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

/** Menekan tombol status lalu memilih tombol di dialog konfirmasi (`null` = dialog dibiarkan terbuka). */
async function tekan(wadah: HTMLElement, pilihan: string | null) {
  act(() => tombol(wadah).click());
  if (pilihan !== null) await pilihDiDialogKonfirmasi(pilihan);
}

let konfirmasiBawaan: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tiruan.ubahStatusToko.mockReset();
  konfirmasiBawaan = vi.fn(() => true);
  vi.stubGlobal("confirm", konfirmasiBawaan);
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

  it("dialog konfirmasi muncul sebelum simpan; Batal → tidak ada yang disimpan", async () => {
    const wadah = buka(true);
    await tekan(wadah, null);
    expect(judulDialogKonfirmasi()).toBe("Nonaktifkan toko LMK?");
    expect(dialogKonfirmasi()?.textContent).toContain(
      "Toko nonaktif tidak bisa ditambahkan ke gudang dan tidak ikut masuk draft, walaupun masih punya jadwal aktif.",
    );
    expect(tombolDialogKonfirmasi("Nonaktifkan").className).toContain("bg-destructive");
    expect(tiruan.ubahStatusToko).not.toHaveBeenCalled();
    await pilihDiDialogKonfirmasi("Batal");
    expect(dialogKonfirmasi()).toBeNull();
    expect(tiruan.ubahStatusToko).not.toHaveBeenCalled();
    expect(status(wadah)).toBeNull();
    expect(konfirmasiBawaan).not.toHaveBeenCalled();
  });

  it("tombol di baris tabel bergaris destructive, bukan merah penuh (DESIGN §11.3)", () => {
    const kelas = tombol(buka(true)).className.split(" ");
    expect(kelas).toContain("border-destructive");
    expect(kelas).not.toContain("bg-destructive");
  });

  it("dikonfirmasi → menonaktifkan; sedang menyimpan lalu berhasil tampil dekat tombol", async () => {
    let selesai: (hasil: { keadaan: "berhasil" }) => void = () => {};
    tiruan.ubahStatusToko.mockReturnValue(new Promise((r) => (selesai = r)));
    const wadah = buka(true);
    await tekan(wadah, "Nonaktifkan");
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
    await tekan(wadah, null);
    expect(judulDialogKonfirmasi()).toBe("Aktifkan toko LMK?");
    expect(tombolDialogKonfirmasi("Aktifkan").className).toContain("bg-primary");
    await pilihDiDialogKonfirmasi("Aktifkan");
    expect(tiruan.ubahStatusToko).toHaveBeenCalledWith({ idToko: 7, aktif: true });
  });

  it("gagal: pesan alasan tampil", async () => {
    tiruan.ubahStatusToko.mockResolvedValue({ keadaan: "gagal", pesan: "Toko tidak ditemukan. Muat ulang halaman." });
    const wadah = buka(true);
    await tekan(wadah, "Nonaktifkan");
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("gagal");
    expect(status(wadah)?.textContent).toBe("Gagal — Toko tidak ditemukan. Muat ulang halaman.");
  });

  it("tersimpan tetapi gagal memuat ulang: keadaan kelima tampil", async () => {
    tiruan.ubahStatusToko.mockResolvedValue({ keadaan: "tersimpanGagalMuatUlang" });
    const wadah = buka(true);
    await tekan(wadah, "Nonaktifkan");
    expect(status(wadah)?.textContent).toBe("Perubahan tersimpan. Muat ulang halaman untuk melihatnya.");
  });

  it("hasil belum pasti (jaringan putus): tidak diulang otomatis, tampil cara memeriksanya", async () => {
    tiruan.ubahStatusToko.mockRejectedValue(new TypeError("Failed to fetch"));
    const wadah = buka(true);
    await tekan(wadah, "Nonaktifkan");
    expect(tiruan.ubahStatusToko).toHaveBeenCalledTimes(1);
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("gagal");
    expect(status(wadah)?.textContent).toBe(`Gagal — ${pesanBelumPasti("status toko di daftar toko")}`);
  });
});
