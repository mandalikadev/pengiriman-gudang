// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ nonaktifkanPengguna: vi.fn(), aktifkanKembaliPengguna: vi.fn() }));
vi.mock("./aksi", () => ({
  nonaktifkanPengguna: tiruan.nonaktifkanPengguna,
  aktifkanKembaliPengguna: tiruan.aktifkanKembaliPengguna,
  ubahPeran: vi.fn(),
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

import { BarisPengguna, type DataPengguna } from "./baris-pengguna";

// T109 (DESIGN §11.3): nonaktifkan dan aktifkan kembali pengguna meminta konfirmasi lewat dialog konfirmasi aplikasi,
// bukan `window.confirm`. Batal tidak mengubah data; tombol tindakan menjalankan aksi yang sama seperti sebelumnya.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PENGGUNA: DataPengguna = { id: "u-1", nama: "Sari", email: "sari@contoh.id", peran: "viewer", nonaktif: false };

function pasang(nonaktif: boolean) {
  return pasangUntukUji(
    <table>
      <tbody>
        <BarisPengguna pengguna={{ ...PENGGUNA, nonaktif }} />
      </tbody>
    </table>,
  );
}

beforeEach(() => {
  tiruan.nonaktifkanPengguna.mockReset();
  tiruan.aktifkanKembaliPengguna.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  lepasTerpasang();
  vi.unstubAllGlobals();
});

describe("nonaktifkan pengguna", () => {
  it("tombol di baris bergaris destructive; dialog: Batal tidak menonaktifkan", async () => {
    const wadah = pasang(false);
    const pembuka = bukaDialogKonfirmasi(wadah, "Nonaktifkan");
    expect(pembuka.className.split(" ")).toContain("border-destructive");
    expect(pembuka.className.split(" ")).not.toContain("bg-destructive");
    expect(judulDialogKonfirmasi()).toBe("Nonaktifkan Sari?");
    expect(dialogKonfirmasi()?.textContent).toContain("Pengguna ini tidak bisa masuk lagi.");
    expect(tombolDialogKonfirmasi("Nonaktifkan").className).toContain("bg-destructive");
    await pilihDiDialogKonfirmasi("Batal");
    expect(tiruan.nonaktifkanPengguna).not.toHaveBeenCalled();
    expect(wadah.querySelector("[data-keadaan]")).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("Nonaktifkan menjalankan aksi nonaktifkan pengguna itu", async () => {
    tiruan.nonaktifkanPengguna.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang(false);
    bukaDialogKonfirmasi(wadah, "Nonaktifkan");
    await pilihDiDialogKonfirmasi("Nonaktifkan");
    expect(tiruan.nonaktifkanPengguna).toHaveBeenCalledWith({ idPengguna: "u-1" });
    expect(wadah.querySelector("[data-keadaan]")?.getAttribute("data-keadaan")).toBe("berhasil");
  });
});

describe("aktifkan kembali pengguna", () => {
  it("Batal tidak mengaktifkan; Aktifkan kembali menjalankan aksinya", async () => {
    tiruan.aktifkanKembaliPengguna.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang(true);
    bukaDialogKonfirmasi(wadah, "Aktifkan kembali");
    expect(judulDialogKonfirmasi()).toBe("Aktifkan kembali Sari?");
    expect(dialogKonfirmasi()?.textContent).toContain("Pengguna ini bisa masuk lagi.");
    await pilihDiDialogKonfirmasi("Batal");
    expect(tiruan.aktifkanKembaliPengguna).not.toHaveBeenCalled();

    bukaDialogKonfirmasi(wadah, "Aktifkan kembali");
    await pilihDiDialogKonfirmasi("Aktifkan kembali");
    expect(tiruan.aktifkanKembaliPengguna).toHaveBeenCalledWith({ idPengguna: "u-1" });
  });
});
