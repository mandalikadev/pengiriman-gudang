/**
 * Markup tanpa tombol bantuan istilah (T121, DESIGN §11.6), untuk test yang memastikan halaman hanya-baca tidak punya
 * kontrol ubah: bantuan istilah adalah tombol yang hanya membuka penjelasan, bukan tindakan.
 */
export function tanpaBantuanIstilah(html: string) {
  return html.replace(/<button[^>]*data-bantuan-istilah="[^"]*"[^>]*>.*?<\/button>/g, "");
}
