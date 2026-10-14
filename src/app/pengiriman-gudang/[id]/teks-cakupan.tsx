import { BantuanIstilah } from "@/components/bantuan-istilah";

// Teks cakupan lengkap (DESIGN §11.6, T121) di draft, rincian baris, dan rincian rencana final. Panjang cakupan (L) dan
// persiapan (p) adalah hasil hitung yang tersimpan; cakupan H−p sampai H+L−1 (CONTEXT.md) berisi p + L hari.

/** Mis. p = 1, L = 7 → "Cakupan 8 hari: persiapan 1 hari + 7 hari sampai sebelum kiriman berikutnya"; p = 0 tanpa persiapan. */
export function teksCakupan(persiapanHari: number, panjangCakupan: number) {
  const persiapan = persiapanHari > 0 ? `persiapan ${persiapanHari} hari + ` : "";
  return `Cakupan ${persiapanHari + panjangCakupan} hari: ${persiapan}${panjangCakupan} hari sampai sebelum kiriman berikutnya`;
}

/**
 * Teks cakupan dengan bantuan istilah di samping "Cakupan", "persiapan", dan panjang cakupan. Tombol bantuan hanya
 * berlabel `aria-label`, jadi teks yang terbaca sama persis dengan `teksCakupan`.
 */
export function TeksCakupan({ persiapanHari, panjangCakupan }: { persiapanHari: number; panjangCakupan: number }) {
  return (
    <span data-teks-cakupan={teksCakupan(persiapanHari, panjangCakupan)}>
      Cakupan
      <BantuanIstilah istilah="cakupan" /> {persiapanHari + panjangCakupan} hari:{" "}
      {persiapanHari > 0 ? (
        <>
          persiapan
          <BantuanIstilah istilah="persiapan" /> {persiapanHari} hari +{" "}
        </>
      ) : null}
      {panjangCakupan} hari
      <BantuanIstilah istilah="panjangCakupan" /> sampai sebelum kiriman berikutnya
    </span>
  );
}
