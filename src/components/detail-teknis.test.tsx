// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DetailTeknis } from "./detail-teknis";

// T121 (DESIGN §11.6): identitas teknis file disembunyikan di bawah "Detail teknis" yang bisa dibuka; datanya tidak dihapus.

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

const SHA = "a3f1c2d4e5b6a7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70";

/** Teks yang terlihat: isi `<details>` yang tertutup tidak dirender browser kecuali `<summary>`-nya. */
function teksTerlihat(akarElemen: Element): string {
  let teks = "";
  for (const anak of akarElemen.childNodes) {
    if (anak.nodeType === Node.TEXT_NODE) teks += anak.textContent ?? "";
    else if (anak instanceof HTMLDetailsElement && !anak.open) teks += anak.querySelector(":scope > summary")?.textContent ?? "";
    else if (anak instanceof Element) teks += teksTerlihat(anak);
  }
  return teks;
}

describe("DetailTeknis", () => {
  it("SHA-256 dan ukuran byte tidak terlihat sebelum dibuka, dan tetap ada di DOM setelah dibuka", () => {
    act(() =>
      akar.render(
        <DetailTeknis>
          <p>SHA-256: {SHA}</p>
          <p>17.411.636 byte</p>
        </DetailTeknis>,
      ),
    );
    const details = wadah.querySelector<HTMLDetailsElement>("details[data-detail-teknis]")!;
    const summary = details.querySelector("summary")!;
    expect(summary.textContent).toBe("Detail teknis");
    expect(details.open).toBe(false);
    expect(teksTerlihat(wadah)).toBe("Detail teknis");
    expect(teksTerlihat(wadah)).not.toContain(SHA);
    expect(teksTerlihat(wadah)).not.toContain("byte");

    act(() => summary.click());
    expect(details.open).toBe(true);
    expect(teksTerlihat(wadah)).toContain(SHA);
    expect(teksTerlihat(wadah)).toContain("17.411.636 byte");
  });
});
