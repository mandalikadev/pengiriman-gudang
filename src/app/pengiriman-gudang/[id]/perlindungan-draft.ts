"use client";

import { useEffect } from "react";

// Perlindungan draft (PRD A7; T59): selama ada isian yang belum disimpan, meninggalkan halaman memunculkan peringatan.
// Menutup tab, memuat ulang, atau membuka alamat lain memakai peringatan bawaan peramban (`beforeunload`); tautan di dalam
// aplikasi (navigasi klien Next.js) memakai konfirmasi. Satu pasang listener untuk semua form yang belum disimpan.

const PESAN_TINGGALKAN = "Ada perubahan stok yang belum disimpan. Tinggalkan halaman ini?";

const formBelumDisimpan = new Set<symbol>();

function padaBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Peramban lama butuh returnValue terisi.
  event.returnValue = "";
}

function padaKlik(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const tautan = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(tautan instanceof HTMLAnchorElement) || (tautan.target !== "" && tautan.target !== "_self") || tautan.hasAttribute("download")) {
    return;
  }
  const tujuan = new URL(tautan.href, window.location.href);
  // Alamat lain ditangani beforeunload; pindah ke jangkar di halaman yang sama tidak meninggalkan halaman.
  if (tujuan.origin !== window.location.origin) return;
  if (tujuan.pathname === window.location.pathname && tujuan.search === window.location.search) return;
  if (!window.confirm(PESAN_TINGGALKAN)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/** Memasang peringatan meninggalkan halaman selama `belumDisimpan` bernilai true. */
export function usePeringatanTinggalkan(belumDisimpan: boolean) {
  useEffect(() => {
    if (!belumDisimpan) return;
    const kunci = Symbol("form-belum-disimpan");
    if (formBelumDisimpan.size === 0) {
      window.addEventListener("beforeunload", padaBeforeUnload);
      document.addEventListener("click", padaKlik, true);
    }
    formBelumDisimpan.add(kunci);
    return () => {
      formBelumDisimpan.delete(kunci);
      if (formBelumDisimpan.size === 0) {
        window.removeEventListener("beforeunload", padaBeforeUnload);
        document.removeEventListener("click", padaKlik, true);
      }
    };
  }, [belumDisimpan]);
}
