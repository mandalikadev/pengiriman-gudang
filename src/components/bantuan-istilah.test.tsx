// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BantuanIstilah } from "./bantuan-istilah";
import { TEKS_BANTUAN_ISTILAH, type IstilahBantuan } from "./teks-bantuan-istilah";

// T121 (DESIGN §11.6): bantuan istilah = ikon CircleHelp yang membuka penjelasan 1–2 kalimat (popover Radix). Terbuka
// dengan klik dan dengan Enter/Spasi, menampilkan teks yang benar, dan tertutup dengan Esc.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let wadah: HTMLElement;
let akar: Root;

beforeEach(() => {
  wadah = document.createElement("div");
  document.body.append(wadah);
  akar = createRoot(wadah);
});

afterEach(() => {
  act(() => akar.unmount());
  wadah.remove();
});

function pasang(istilah: IstilahBantuan) {
  act(() =>
    akar.render(
      <p>
        Cakupan <BantuanIstilah istilah={istilah} />
      </p>,
    ),
  );
  return wadah.querySelector<HTMLButtonElement>(`button[data-bantuan-istilah="${istilah}"]`)!;
}

const isi = () => document.querySelector<HTMLElement>("[data-isi-bantuan-istilah]");

function tekan(elemen: Element, key: string) {
  act(() => {
    elemen.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    elemen.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
  });
}

function esc() {
  act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
}

describe("BantuanIstilah", () => {
  it("tombol ikon CircleHelp berlabel istilahnya; penjelasan belum tampil", () => {
    const tombol = pasang("cakupan");
    expect(tombol.getAttribute("aria-label")).toBe("Apa itu Cakupan?");
    expect(tombol.querySelector("svg")?.getAttribute("class")).toContain("lucide-circle-help");
    expect(tombol.getAttribute("aria-expanded")).toBe("false");
    expect(isi()).toBeNull();
    // Teks di sekitarnya tidak bertambah (label hanya lewat aria-label).
    expect(wadah.textContent).toBe("Cakupan ");
  });

  it("klik membuka penjelasan yang benar; Esc menutupnya dan fokus kembali ke ikon", async () => {
    const tombol = pasang("cakupan");
    act(() => tombol.focus());
    act(() => tombol.click());
    expect(tombol.getAttribute("aria-expanded")).toBe("true");
    const dialog = isi();
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("role")).toBe("dialog");
    const idJudul = dialog!.getAttribute("aria-labelledby");
    expect(idJudul === null ? null : document.getElementById(idJudul)?.textContent).toBe("Cakupan");
    expect(dialog!.textContent).toContain(TEKS_BANTUAN_ISTILAH.cakupan.penjelasan);

    esc();
    expect(isi()).toBeNull();
    expect(tombol.getAttribute("aria-expanded")).toBe("false");
    // Radix mengembalikan fokus setelah satu putaran timer.
    await act(() => new Promise((selesai) => setTimeout(selesai, 0)));
    expect(document.activeElement).toBe(tombol);
  });

  it.each([
    ["Enter", "Enter"],
    ["Spasi", " "],
  ])("%s membuka penjelasan; Esc menutupnya", (_nama, key) => {
    const tombol = pasang("persiapan");
    act(() => tombol.focus());
    tekan(tombol, key);
    expect(isi()?.textContent).toContain(TEKS_BANTUAN_ISTILAH.persiapan.penjelasan);
    expect(isi()?.textContent).toContain("Persiapan (H, H−1, H−2)");
    esc();
    expect(isi()).toBeNull();
  });

  it("menekan ikonnya lagi menutup penjelasan", () => {
    const tombol = pasang("buffer");
    act(() => tombol.focus());
    tekan(tombol, "Enter");
    expect(isi()).not.toBeNull();
    act(() => tombol.focus());
    tekan(tombol, "Enter");
    expect(isi()).toBeNull();
  });

  it("dirender di server sebagai tombol saja, tanpa penjelasan", () => {
    const html = renderToStaticMarkup(<BantuanIstilah istilah="hanyaBaca" />);
    expect(html).toContain('aria-label="Apa itu Hanya-baca?"');
    expect(html).not.toContain(TEKS_BANTUAN_ISTILAH.hanyaBaca.penjelasan);
  });
});

describe("teks bantuan istilah (DESIGN §11.6)", () => {
  it("memuat istilah wajib dengan penjelasan satu atau dua kalimat", () => {
    const wajib: IstilahBantuan[] = [
      "persiapan",
      "cakupan",
      "panjangCakupan",
      "tanggalJangkar",
      "kategori",
      "klasifikasiProduk",
      "buffer",
      "hanyaBaca",
      "periodeSumber",
    ];
    for (const istilah of wajib) {
      const { penjelasan } = TEKS_BANTUAN_ISTILAH[istilah];
      const kalimat = penjelasan.split(/(?<=\.)\s+/).filter((k) => k.length > 0);
      expect(kalimat.length, istilah).toBeGreaterThanOrEqual(1);
      expect(kalimat.length, istilah).toBeLessThanOrEqual(2);
    }
  });
});
