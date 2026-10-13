// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ hapusAliasStok: vi.fn() }));
vi.mock("./aksi", () => ({ hapusAliasStok: tiruan.hapusAliasStok }));

import {
  bukaDialogKonfirmasi,
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";

import { DaftarAlias } from "./daftar-alias";

// T109 (DESIGN §11.3): hapus alias nama stok meminta konfirmasi lewat dialog konfirmasi aplikasi.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DAFTAR = [{ alias: "MKG GORGEOUS 110", kodeProduk: "PW110P-GOR", namaProduk: "Gorgeous 110 ml" }];

beforeEach(() => tiruan.hapusAliasStok.mockReset());
afterEach(lepasTerpasang);

describe("hapus alias nama stok", () => {
  it("tombol di baris bergaris destructive; dialog: Batal tidak menghapus", async () => {
    const wadah = pasangUntukUji(<DaftarAlias daftar={DAFTAR} />);
    const pembuka = bukaDialogKonfirmasi(wadah, "Hapus alias MKG GORGEOUS 110");
    expect(pembuka.className.split(" ")).toContain("border-destructive");
    expect(pembuka.className.split(" ")).not.toContain("bg-destructive");
    expect(judulDialogKonfirmasi()).toBe("Hapus alias MKG GORGEOUS 110?");
    expect(dialogKonfirmasi()?.textContent).toContain("Nama ini di file stok tidak lagi dicocokkan ke PW110P-GOR.");
    expect(tombolDialogKonfirmasi("Hapus").className).toContain("bg-destructive");
    await pilihDiDialogKonfirmasi("Batal");
    expect(tiruan.hapusAliasStok).not.toHaveBeenCalled();
    expect(wadah.querySelector("[data-keadaan]")).toBeNull();
  });

  it("Hapus menjalankan aksi hapus alias itu", async () => {
    tiruan.hapusAliasStok.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasangUntukUji(<DaftarAlias daftar={DAFTAR} />);
    bukaDialogKonfirmasi(wadah, "Hapus alias MKG GORGEOUS 110");
    await pilihDiDialogKonfirmasi("Hapus");
    expect(tiruan.hapusAliasStok).toHaveBeenCalledWith({ alias: "MKG GORGEOUS 110" });
    expect(wadah.querySelector("[data-keadaan]")?.getAttribute("data-keadaan")).toBe("berhasil");
  });
});
