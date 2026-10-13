// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { DialogKonfirmasi } from "./dialog-konfirmasi";
import {
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "./uji-bantu-dialog-konfirmasi";

// T109 (DESIGN §11.3): dialog konfirmasi aplikasi. Judul berupa pertanyaan, akibat 1–2 kalimat, tombol "Batal" dan
// tombol tindakan bertuliskan kata kerjanya; tindakan merusak bervarian destructive; fokus awal pada "Batal".

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(lepasTerpasang);

function pasang(destruktif: boolean, konfirmasi: () => void) {
  return pasangUntukUji(
    <DialogKonfirmasi
      judul="Hapus alias LAVENDER?"
      akibat="Nama ini tidak lagi dicocokkan."
      labelTindakan="Hapus"
      destruktif={destruktif}
      konfirmasi={konfirmasi}
      pemicu={<Button type="button">Buka</Button>}
    />,
  );
}

function buka(wadah: HTMLElement) {
  const pembuka = wadah.querySelector("button")!;
  act(() => pembuka.focus());
  act(() => pembuka.click());
  return pembuka;
}

describe("DialogKonfirmasi", () => {
  it("tertutup sampai pemicunya ditekan; berisi pertanyaan, akibat, Batal, dan kata kerja tindakan", () => {
    const wadah = pasang(true, vi.fn());
    expect(dialogKonfirmasi()).toBeNull();
    buka(wadah);
    expect(judulDialogKonfirmasi()).toBe("Hapus alias LAVENDER?");
    const idAkibat = dialogKonfirmasi()!.getAttribute("aria-describedby");
    expect(idAkibat === null ? null : document.getElementById(idAkibat)?.textContent).toBe("Nama ini tidak lagi dicocokkan.");
    expect([...dialogKonfirmasi()!.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Batal", "Hapus"]);
  });

  it("fokus awal pada Batal", () => {
    buka(pasang(true, vi.fn()));
    expect(document.activeElement).toBe(tombolDialogKonfirmasi("Batal"));
  });

  it("tindakan merusak memakai varian destructive; tindakan lain varian default", () => {
    buka(pasang(true, vi.fn()));
    expect(tombolDialogKonfirmasi("Hapus").className).toContain("bg-destructive");
    lepasTerpasang();

    buka(pasang(false, vi.fn()));
    expect(tombolDialogKonfirmasi("Hapus").className).toContain("bg-primary");
  });

  it("Batal menutup tanpa menjalankan tindakan", async () => {
    const konfirmasi = vi.fn();
    buka(pasang(true, konfirmasi));
    await pilihDiDialogKonfirmasi("Batal");
    expect(dialogKonfirmasi()).toBeNull();
    expect(konfirmasi).not.toHaveBeenCalled();
  });

  it("Esc menutup tanpa menjalankan tindakan", () => {
    const konfirmasi = vi.fn();
    buka(pasang(true, konfirmasi));
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(dialogKonfirmasi()).toBeNull();
    expect(konfirmasi).not.toHaveBeenCalled();
  });

  it("tombol tindakan menjalankan tindakan sekali lalu menutup", async () => {
    const konfirmasi = vi.fn();
    buka(pasang(true, konfirmasi));
    await pilihDiDialogKonfirmasi("Hapus");
    expect(konfirmasi).toHaveBeenCalledTimes(1);
    expect(dialogKonfirmasi()).toBeNull();
  });
});
