// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/ringkasan" }));
vi.mock("@/app/keluar/aksi", () => ({ keluar: async () => undefined }));

import { Navigasi } from "./navigasi";

// T78: di layar kecil, tombol menu membuka sidebar sebagai menu tarik; menu ditutup dengan tombol tutup, Escape,
// atau memilih item. Keadaan terbuka/tertutup dinyatakan lewat kelas tampilan dan aria-expanded.

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
      <Navigasi pengguna={{ nama: "Operator Uji", peran: "operator" }} tampilkanPengirimanGudang>
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

function sidebar(): HTMLElement {
  const elemen = wadah.querySelector<HTMLElement>("aside");
  if (elemen === null) throw new Error("Sidebar tidak ada.");
  return elemen;
}

const terbuka = () => !sidebar().classList.contains("hidden");

function klik(elemen: Element) {
  act(() => elemen.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

function tekanEscape() {
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
}

describe("menu tarik di layar kecil", () => {
  it("tertutup saat dimuat; tombol menu membukanya dan memberi tahu keadaannya", () => {
    expect(terbuka()).toBe(false);
    const tombolMenu = tombol("Buka menu");
    expect(tombolMenu.getAttribute("aria-expanded")).toBe("false");
    expect(tombolMenu.getAttribute("aria-controls")).toBe(sidebar().id);

    klik(tombolMenu);
    expect(terbuka()).toBe(true);
    expect(tombolMenu.getAttribute("aria-expanded")).toBe("true");
    expect(tombolMenu.getAttribute("aria-label")).toBe("Tutup menu");
  });

  it("tombol tutup di dalam menu menutupnya dan mengembalikan fokus ke tombol menu", () => {
    const tombolMenu = tombol("Buka menu");
    klik(tombolMenu);
    const tombolTutup = sidebar().querySelector<HTMLButtonElement>('button[aria-label="Tutup menu"]');
    expect(tombolTutup).not.toBeNull();
    expect(document.activeElement).toBe(tombolTutup);

    klik(tombolTutup!);
    expect(terbuka()).toBe(false);
    expect(document.activeElement).toBe(tombolMenu);
  });

  it("Escape menutup menu", () => {
    klik(tombol("Buka menu"));
    expect(terbuka()).toBe(true);
    tekanEscape();
    expect(terbuka()).toBe(false);
  });

  it("Escape saat menu tertutup tidak mengubah apa pun", () => {
    tekanEscape();
    expect(terbuka()).toBe(false);
  });

  it("memilih item menutup menu", () => {
    klik(tombol("Buka menu"));
    const kalender = sidebar().querySelector<HTMLAnchorElement>('a[href="/kalender"]');
    expect(kalender).not.toBeNull();
    klik(kalender!);
    expect(terbuka()).toBe(false);
  });
});
