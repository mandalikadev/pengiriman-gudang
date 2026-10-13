import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

// Bantuan test untuk dialog konfirmasi (T109). Dialog dirender lewat portal ke `document.body`, bukan ke wadah test.

/** Dialog konfirmasi yang sedang terbuka; `null` bila tidak ada. */
export const dialogKonfirmasi = () => document.querySelector<HTMLElement>('[role="alertdialog"]');

/** Teks judul dialog konfirmasi yang terbuka (nama aksesibelnya). */
export function judulDialogKonfirmasi(): string | null {
  const id = dialogKonfirmasi()?.getAttribute("aria-labelledby");
  return id == null ? null : (document.getElementById(id)?.textContent ?? null);
}

/** Tombol di dialog konfirmasi yang terbuka, menurut teksnya ("Batal" atau kata kerja tindakan). */
export function tombolDialogKonfirmasi(nama: string): HTMLButtonElement {
  const isi = dialogKonfirmasi();
  if (isi === null) throw new Error("Dialog konfirmasi tidak terbuka.");
  const tombol = [...isi.querySelectorAll("button")].find((b) => b.textContent?.trim() === nama);
  if (tombol === undefined) throw new Error(`Tombol "${nama}" tidak ada di dialog konfirmasi.`);
  return tombol;
}

/** Memilih tombol di dialog konfirmasi, lalu menunggu aksi yang dijalankannya. */
export async function pilihDiDialogKonfirmasi(nama: string) {
  const tombol = tombolDialogKonfirmasi(nama);
  await act(async () => {
    tombol.click();
  });
}

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

/** Merender `isi` ke wadah baru di `document.body`; lepas dengan `lepasTerpasang` di `afterEach`. */
export function pasangUntukUji(isi: ReactNode): HTMLElement {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() => akar.render(isi));
  terpasang = { wadah, akar };
  return wadah;
}

export function lepasTerpasang() {
  if (terpasang === null) return;
  const { wadah, akar } = terpasang;
  act(() => akar.unmount());
  wadah.remove();
  terpasang = null;
}

/** Menekan tombol pembuka dialog konfirmasi berdasarkan `aria-label` atau teksnya. */
export function bukaDialogKonfirmasi(wadah: HTMLElement, nama: string) {
  const tombol = [...wadah.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === nama || b.textContent?.trim() === nama,
  );
  if (tombol === undefined) throw new Error(`Tombol "${nama}" tidak ada.`);
  act(() => tombol.click());
  return tombol;
}
