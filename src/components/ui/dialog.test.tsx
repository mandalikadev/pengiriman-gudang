// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Dialog, DialogIsi } from "./dialog";

// T108 (DESIGN §6 ▶ Revisi, §11.2): panel samping dan dialog dari Radix Dialog. Dibuka dari sebuah tombol; ditutup
// dengan tombol "Tutup", Esc, atau klik di luar; fokus terkunci di dalam lalu kembali ke pembukanya.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Contoh({ bentuk }: { bentuk: "samping" | "tengah" }) {
  const [terbuka, setTerbuka] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setTerbuka(true)}>
        Lihat rincian
      </button>
      <button type="button">Tombol lain di halaman</button>
      <Dialog open={terbuka} onOpenChange={setTerbuka}>
        <DialogIsi bentuk={bentuk} judul="Rincian perhitungan UJI-A · Toko Uji">
          <p>Isi rincian</p>
          <a href="#sumber">Sumber</a>
        </DialogIsi>
      </Dialog>
    </>
  );
}

let wadah: HTMLElement;
let akar: Root;

afterEach(() => {
  act(() => akar.unmount());
  wadah.remove();
});

function pasang(bentuk: "samping" | "tengah") {
  wadah = document.createElement("div");
  document.body.append(wadah);
  akar = createRoot(wadah);
  act(() => akar.render(<Contoh bentuk={bentuk} />));
}

function tombol(nama: string): HTMLButtonElement {
  const elemen = [...wadah.querySelectorAll("button")].find((b) => b.textContent?.trim() === nama);
  if (elemen === undefined) throw new Error(`Tombol "${nama}" tidak ada.`);
  return elemen;
}

const dialog = () => wadah.querySelector<HTMLElement>('[role="dialog"]');

function klik(elemen: Element) {
  act(() => elemen.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

/** Membuka dari tombol pembuka yang sedang difokus, seperti klik sungguhan. */
function buka() {
  const pembuka = tombol("Lihat rincian");
  act(() => pembuka.focus());
  klik(pembuka);
  return pembuka;
}

/** Radix memasang pendengar klik luar, dan mengembalikan fokus setelah ditutup, setelah satu putaran timer. */
const tungguTimer = () => act(() => new Promise((selesai) => setTimeout(selesai, 0)));

describe.each(["samping", "tengah"] as const)("DialogIsi bentuk %s", (bentuk) => {
  beforeEach(() => pasang(bentuk));

  it("dibuka sebagai dialog berjudul, dengan tombol Tutup di kepala dan fokus di dalam", () => {
    expect(dialog()).toBeNull();
    buka();
    const isi = dialog();
    expect(isi).not.toBeNull();
    expect(isi!.dataset.bentuk).toBe(bentuk);
    const idJudul = isi!.getAttribute("aria-labelledby");
    expect(idJudul === null ? null : document.getElementById(idJudul)?.textContent).toBe("Rincian perhitungan UJI-A · Toko Uji");
    expect(isi!.textContent).toContain("Isi rincian");
    const tutup = [...isi!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Tutup");
    expect(tutup).toBeDefined();
    expect(isi!.contains(document.activeElement)).toBe(true);
  });

  it("tombol Tutup menutup dan fokus kembali ke pembukanya", async () => {
    const pembuka = buka();
    const tutup = [...dialog()!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Tutup");
    klik(tutup!);
    expect(dialog()).toBeNull();
    await tungguTimer();
    expect(document.activeElement).toBe(pembuka);
  });

  it("Esc menutup dan fokus kembali ke pembukanya", async () => {
    const pembuka = buka();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(dialog()).toBeNull();
    await tungguTimer();
    expect(document.activeElement).toBe(pembuka);
  });

  it("klik di luar menutup dan fokus kembali ke pembukanya", async () => {
    const pembuka = buka();
    await tungguTimer();
    const lapisan = wadah.querySelector('[data-slot="dialog-overlay"]');
    expect(lapisan).not.toBeNull();
    act(() => {
      lapisan!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
      lapisan!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await tungguTimer();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(pembuka);
  });

  it("klik di dalam tidak menutup; fokus tidak bisa keluar selama terbuka", async () => {
    buka();
    await tungguTimer();
    const paragraf = dialog()!.querySelector("p")!;
    act(() => {
      paragraf.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
      paragraf.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await tungguTimer();
    expect(dialog()).not.toBeNull();

    act(() => tombol("Tombol lain di halaman").focus());
    expect(dialog()!.contains(document.activeElement)).toBe(true);
  });
});

describe("bentuk dan tata letak (DESIGN §11.2)", () => {
  it("panel samping dari kanan: ±560 px di desktop, layar penuh di layar < 640 px", () => {
    pasang("samping");
    buka();
    const kelas = dialog()!.className.split(" ");
    expect(kelas).toEqual(expect.arrayContaining(["fixed", "inset-y-0", "right-0", "w-full", "sm:w-[35rem]"]));
  });

  it("dialog di tengah layar tanpa translate (translate dimatikan saat prefers-reduced-motion)", () => {
    pasang("tengah");
    buka();
    const kelas = dialog()!.className;
    expect(kelas).toContain("m-auto");
    expect(kelas).not.toContain("translate");
  });
});
