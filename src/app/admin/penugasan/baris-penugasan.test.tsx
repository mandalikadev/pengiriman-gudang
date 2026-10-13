// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ cabutPenugasanOperator: vi.fn() }));
vi.mock("./aksi", () => ({ cabutPenugasanOperator: tiruan.cabutPenugasanOperator, simpanHakTindakan: vi.fn() }));

import {
  bukaDialogKonfirmasi,
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";

import { BarisPenugasan, type DataPenugasan } from "./baris-penugasan";

// T109 (DESIGN §11.3): cabut penugasan meminta konfirmasi lewat dialog konfirmasi aplikasi, bukan `window.confirm`.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PENUGASAN: DataPenugasan = {
  idPengguna: "u-2",
  namaPengguna: "Budi",
  email: "budi@contoh.id",
  nonaktif: false,
  idGudang: 4,
  namaGudang: "Pusat",
  hakTindakan: ["input-stok"],
};

function pasang() {
  return pasangUntukUji(
    <table>
      <tbody>
        <BarisPenugasan penugasan={PENUGASAN} />
      </tbody>
    </table>,
  );
}

beforeEach(() => {
  tiruan.cabutPenugasanOperator.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  lepasTerpasang();
  vi.unstubAllGlobals();
});

describe("cabut penugasan", () => {
  it("tombol di baris bergaris destructive; dialog: Batal tidak mencabut", async () => {
    const wadah = pasang();
    const pembuka = bukaDialogKonfirmasi(wadah, "Cabut penugasan");
    expect(pembuka.className.split(" ")).toContain("border-destructive");
    expect(pembuka.className.split(" ")).not.toContain("bg-destructive");
    expect(judulDialogKonfirmasi()).toBe("Cabut penugasan Budi di Pusat?");
    expect(dialogKonfirmasi()?.textContent).toContain("Semua hak tindakannya di gudang ini hilang.");
    expect(tombolDialogKonfirmasi("Cabut penugasan").className).toContain("bg-destructive");
    await pilihDiDialogKonfirmasi("Batal");
    expect(tiruan.cabutPenugasanOperator).not.toHaveBeenCalled();
    expect(wadah.querySelector("[data-keadaan]")).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("Cabut penugasan menjalankan aksi cabut untuk pengguna dan gudang itu", async () => {
    tiruan.cabutPenugasanOperator.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang();
    bukaDialogKonfirmasi(wadah, "Cabut penugasan");
    await pilihDiDialogKonfirmasi("Cabut penugasan");
    expect(tiruan.cabutPenugasanOperator).toHaveBeenCalledWith({ idPengguna: "u-2", idGudang: 4 });
    expect(wadah.querySelector("[data-keadaan]")?.getAttribute("data-keadaan")).toBe("berhasil");
  });
});
