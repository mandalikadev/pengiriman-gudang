// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ hitungDraft: vi.fn(), push: vi.fn() }));
vi.mock("./aksi-draft", () => ({ hitungDraft: tiruan.hitungDraft }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: tiruan.push }) }));

import { parseTanggalBisnis } from "@/domain/kalender";

import { FormHitungDraft } from "./form-hitung-draft";

// T118 (DESIGN §11.5): saran tanggal kirim di form "Hitung kebutuhan" bisa dipilih sekali klik; tanggal lain tetap bisa
// diketik.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function buka(saran: string[]) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() => akar.render(<FormHitungDraft idGudang={3} saranTanggal={saran.map(parseTanggalBisnis)} />));
  terpasang = { wadah, akar };
  return wadah;
}

afterEach(() => {
  if (terpasang === null) return;
  act(() => terpasang?.akar.unmount());
  terpasang.wadah.remove();
  terpasang = null;
  vi.clearAllMocks();
});

const isianTanggal = (wadah: HTMLElement) => wadah.querySelector<HTMLInputElement>('input[type="date"]')!;
const saran = (wadah: HTMLElement, tanggal: string) => wadah.querySelector<HTMLButtonElement>(`button[data-saran="${tanggal}"]`)!;
const tombolHitung = (wadah: HTMLElement) => wadah.querySelector<HTMLButtonElement>('button[type="submit"]')!;

describe("FormHitungDraft: saran tanggal kirim", () => {
  it("mengklik saran mengisi tanggal kirim, menandai saran terpilih, dan Hitung kebutuhan memakai tanggal itu", async () => {
    tiruan.hitungDraft.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = buka(["2026-10-15", "2026-10-19"]);
    const grup = wadah.querySelector('[role="group"]')!;
    expect(grup.textContent).toContain("Saran tanggal kirim");
    expect([...grup.querySelectorAll("button")].map((b) => [b.type, b.textContent])).toEqual([
      ["button", "Kamis, 15-10-2026"],
      ["button", "Senin, 19-10-2026"],
    ]);
    expect(isianTanggal(wadah).value).toBe("");
    expect(tombolHitung(wadah).disabled).toBe(true);

    act(() => saran(wadah, "2026-10-19").click());
    expect(isianTanggal(wadah).value).toBe("2026-10-19");
    expect(saran(wadah, "2026-10-19").getAttribute("aria-pressed")).toBe("true");
    expect(saran(wadah, "2026-10-15").getAttribute("aria-pressed")).toBe("false");
    expect(tombolHitung(wadah).disabled).toBe(false);

    await act(async () => tombolHitung(wadah).click());
    expect(tiruan.hitungDraft).toHaveBeenCalledWith({ idGudang: 3, tanggalKirim: "2026-10-19" });
    expect(tiruan.push).toHaveBeenCalledWith("/pengiriman-gudang/3?tanggal=2026-10-19");
  });

  it("tanpa saran tidak ada grup saran; input tanggal bebas tetap ada", () => {
    const wadah = buka([]);
    expect(wadah.querySelector('[role="group"]')).toBeNull();
    expect(isianTanggal(wadah)).not.toBeNull();
  });
});
