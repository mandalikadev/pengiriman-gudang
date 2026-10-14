// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ lepasToko: vi.fn() }));
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

import { TombolLepasToko } from "./tombol-lepas-toko";

// T115 (PRD A3 ▶ Revisi 2026-10-13; DESIGN §11.3): tombol "Lepas" per toko terhubung di /admin/gudang. Dialog konfirmasi
// menyebut akibatnya; "Batal" tidak menjalankan apa pun.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const terhubung = { idGudang: 4, namaGudang: "Gudang Cibubur", jumlahPengirimanDibatalkan: 2 };

const pasang = (data: Parameters<typeof TombolLepasToko>[0]) => pasangUntukUji(<TombolLepasToko {...data} />);
const status = (wadah: HTMLElement) => wadah.querySelector("[data-keadaan]");
const tombolLepas = (wadah: HTMLElement) => wadah.querySelector<HTMLButtonElement>('button[aria-label="Lepas BOTANI dari Gudang Cibubur"]');

beforeEach(() => {
  tiruan.lepasToko.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  lepasTerpasang();
  vi.unstubAllGlobals();
});

describe("tombol Lepas toko", () => {
  it("toko terhubung: tombol Lepas bergaya garis destructive (bukan merah penuh)", () => {
    const wadah = pasang({ idToko: 7, namaToko: "BOTANI", terhubung });
    const tombol = tombolLepas(wadah);
    expect(tombol?.textContent).toBe("Lepas");
    expect(tombol?.className.split(" ")).toContain("border-destructive");
    expect(tombol?.className.split(" ")).not.toContain("bg-destructive");
  });

  it("toko belum terhubung: tanpa tombol", () => {
    const wadah = pasang({ idToko: 7, namaToko: "BOTANI", terhubung: null });
    expect(wadah.querySelectorAll("button")).toHaveLength(0);
  });

  it("dialog menyebut akibatnya; Batal → tidak ada yang dijalankan", async () => {
    const wadah = pasang({ idToko: 7, namaToko: "BOTANI", terhubung });
    bukaDialogKonfirmasi(wadah, "Lepas BOTANI dari Gudang Cibubur");
    expect(judulDialogKonfirmasi()).toBe("Lepas BOTANI dari Gudang Cibubur?");
    const isi = dialogKonfirmasi()?.textContent ?? "";
    expect(isi).toContain("Jadwal tetap BOTANI dinonaktifkan");
    expect(isi).toContain("2 pengiriman di luar jadwal yang belum lewat (menunggu atau berlaku) dibatalkan");
    expect(isi).toContain("Rencana final lama tidak berubah.");
    expect(tombolDialogKonfirmasi("Lepas").className).toContain("bg-destructive");

    await pilihDiDialogKonfirmasi("Batal");
    expect(dialogKonfirmasi()).toBeNull();
    expect(tiruan.lepasToko).not.toHaveBeenCalled();
    expect(status(wadah)).toBeNull();
    expect(globalThis.confirm).not.toHaveBeenCalled();
  });

  it("dikonfirmasi → melepas toko dari gudang yang tampil; status berhasil tampil dekat tombol", async () => {
    tiruan.lepasToko.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang({ idToko: 7, namaToko: "BOTANI", terhubung });
    bukaDialogKonfirmasi(wadah, "Lepas BOTANI dari Gudang Cibubur");
    await pilihDiDialogKonfirmasi("Lepas");
    expect(tiruan.lepasToko).toHaveBeenCalledWith({ idGudang: 4, idToko: 7 });
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("berhasil");
  });

  it("penolakan server tampil dekat tombol", async () => {
    tiruan.lepasToko.mockResolvedValue({ keadaan: "gagal", pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi." });
    const wadah = pasang({ idToko: 7, namaToko: "BOTANI", terhubung });
    bukaDialogKonfirmasi(wadah, "Lepas BOTANI dari Gudang Cibubur");
    await pilihDiDialogKonfirmasi("Lepas");
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("gagal");
    expect(status(wadah)?.textContent).toContain("Toko tidak terhubung ke gudang ini");
  });
});
