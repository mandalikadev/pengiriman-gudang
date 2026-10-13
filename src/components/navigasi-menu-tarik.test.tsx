// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/ringkasan" }));
vi.mock("@/app/keluar/aksi", () => ({ keluar: async () => undefined }));

import { Navigasi } from "./navigasi";

// T78: di layar kecil, tombol menu membuka sidebar sebagai menu tarik; menu ditutup dengan tombol tutup, Escape,
// klik di luar, atau memilih item. T108 (DESIGN §11.2): menu tarik memakai komponen dialog yang sama dengan panel
// rincian: role="dialog", fokus terkunci di dalam menu, lalu kembali ke tombol menu.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let wadah: HTMLElement;
let akar: Root;

// jsdom tidak berpindah dokumen; klik tautan dicegah supaya tidak mencatat "navigation not implemented".
const cegahNavigasi = (event: Event) => event.preventDefault();

beforeEach(() => {
  document.addEventListener("click", cegahNavigasi);
  wadah = document.createElement("div");
  document.body.append(wadah);
  akar = createRoot(wadah);
  act(() =>
    akar.render(
      <Navigasi pengguna={{ nama: "Operator Uji", peran: "operator" }} tampilkanPengirimanGudang tampilkanJadwalToko>
        <p>isi</p>
      </Navigasi>,
    ),
  );
});

afterEach(() => {
  act(() => akar.unmount());
  wadah.remove();
  document.removeEventListener("click", cegahNavigasi);
});

function tombol(nama: string): HTMLButtonElement {
  const elemen = wadah.querySelector<HTMLButtonElement>(`button[aria-label="${nama}"]`);
  if (elemen === null) throw new Error(`Tombol "${nama}" tidak ada.`);
  return elemen;
}

/** Menu tarik yang terbuka, atau `null`. */
const menu = () => wadah.querySelector<HTMLElement>('[role="dialog"]');
const terbuka = () => menu() !== null;

function klik(elemen: Element) {
  act(() => elemen.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

function tekanEscape() {
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
}

/** Buka menu dari tombol menu yang sedang difokus (seperti klik sungguhan). */
function bukaMenu() {
  const tombolMenu = tombol("Buka menu");
  act(() => tombolMenu.focus());
  klik(tombolMenu);
  return tombolMenu;
}

/** Radix memasang pendengar klik luar, dan mengembalikan fokus setelah ditutup, setelah satu putaran timer. */
const tungguTimer = () => act(() => new Promise((selesai) => setTimeout(selesai, 0)));

describe("menu tarik di layar kecil", () => {
  it("tertutup saat dimuat; tombol menu membukanya sebagai dialog dan memberi tahu keadaannya", () => {
    expect(terbuka()).toBe(false);
    const tombolMenu = tombol("Buka menu");
    expect(tombolMenu.getAttribute("aria-expanded")).toBe("false");

    bukaMenu();
    expect(terbuka()).toBe(true);
    expect(tombolMenu.getAttribute("aria-expanded")).toBe("true");
    expect(tombolMenu.getAttribute("aria-label")).toBe("Tutup menu");
    expect(tombolMenu.getAttribute("aria-controls")).toBe(menu()!.id);
    expect(menu()!.getAttribute("aria-labelledby")).not.toBeNull();
    expect(menu()!.querySelector('nav[aria-label="Navigasi utama"]')).not.toBeNull();
    expect(menu()!.className).toContain("rounded-3xl");
  });

  it("tombol tutup di dalam menu menutupnya dan mengembalikan fokus ke tombol menu", async () => {
    const tombolMenu = bukaMenu();
    const tombolTutup = menu()!.querySelector<HTMLButtonElement>('button[aria-label="Tutup menu"]');
    expect(tombolTutup).not.toBeNull();
    expect(document.activeElement).toBe(tombolTutup);

    klik(tombolTutup!);
    expect(terbuka()).toBe(false);
    await tungguTimer();
    expect(document.activeElement).toBe(tombolMenu);
  });

  it("fokus terkunci di dalam menu selama terbuka", () => {
    bukaMenu();
    const luar = document.createElement("button");
    wadah.append(luar);
    act(() => luar.focus());
    expect(menu()!.contains(document.activeElement)).toBe(true);
    luar.remove();
  });

  it("Escape menutup menu dan fokus kembali ke tombol menu", async () => {
    const tombolMenu = bukaMenu();
    tekanEscape();
    expect(terbuka()).toBe(false);
    await tungguTimer();
    expect(document.activeElement).toBe(tombolMenu);
  });

  it("klik di luar menu menutupnya", async () => {
    bukaMenu();
    await tungguTimer();
    const lapisan = wadah.querySelector('[data-slot="dialog-overlay"]');
    expect(lapisan).not.toBeNull();
    act(() => {
      lapisan!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
      lapisan!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await tungguTimer();
    expect(terbuka()).toBe(false);
  });

  it("Escape saat menu tertutup tidak mengubah apa pun", () => {
    tekanEscape();
    expect(terbuka()).toBe(false);
  });

  it("memilih item menutup menu", () => {
    bukaMenu();
    const kalender = menu()!.querySelector<HTMLAnchorElement>('a[href="/kalender"]');
    expect(kalender).not.toBeNull();
    klik(kalender!);
    expect(terbuka()).toBe(false);
  });
});
