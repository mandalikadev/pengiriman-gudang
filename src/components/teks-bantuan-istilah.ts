// Teks bantuan singkat untuk istilah domain (DESIGN §11.6, T121). Istilahnya tetap istilah CONTEXT.md; penjelasannya
// satu atau dua kalimat yang diturunkan dari definisi CONTEXT.md dan PRD. Semua teks bantuan ditulis di berkas ini.

export const TEKS_BANTUAN_ISTILAH = {
  persiapan: {
    judul: "Persiapan (H, H−1, H−2)",
    penjelasan:
      "Hari barang disiapkan, dihitung dari tanggal kirim (H): H berarti pada hari kirim, H−1 sehari sebelumnya, dan H−2 dua hari sebelumnya. Hari persiapan ikut masuk cakupan.",
  },
  cakupan: {
    judul: "Cakupan",
    penjelasan:
      "Rentang tanggal yang kebutuhannya dihitung: dari hari persiapan sampai sehari sebelum kiriman berikutnya. Kebutuhan barang adalah jumlah rata-rata sesuai kategori setiap tanggal di rentang ini.",
  },
  panjangCakupan: {
    judul: "Panjang cakupan",
    penjelasan:
      "Jumlah hari dari tanggal kirim sampai sehari sebelum tanggal kirim berikutnya toko ini. Misalnya 7 hari untuk kiriman sekali seminggu dan 14 hari untuk dua mingguan.",
  },
  tanggalJangkar: {
    judul: "Tanggal jangkar",
    penjelasan:
      "Tanggal yang menentukan pekan kirim untuk pola dua mingguan. Hari kirim berlaku di pekan (Senin–Minggu) yang memuat tanggal ini, lalu berulang setiap 14 hari.",
  },
  kategori: {
    judul: "Kategori dasar dan efektif",
    penjelasan:
      "Kategori dasar adalah kategori hari menurut tanggal sebenarnya: Senin–Kamis, Jumat, Sabtu, atau Minggu. Kategori efektif adalah yang dipakai untuk menghitung: perubahan khusus toko, lalu perubahan seluruh toko, lalu kategori dasar.",
  },
  klasifikasiProduk: {
    judul: "Produk otomatis dan manual",
    penjelasan:
      "Produk manual adalah display tester (kode berakhiran -T) dan kertas tester (kategori KTP/KTL), tanpa jumlah kirim dan tanpa buffer otomatis. Semua produk lain adalah produk otomatis.",
  },
  buffer: {
    judul: "Buffer",
    penjelasan:
      "Persen tambahan di atas seluruh kebutuhan barang: 20% untuk varian keluarga aroma tujuh besar ranking pusat, 10% untuk produk otomatis lainnya.",
  },
  hanyaBaca: {
    judul: "Hanya-baca",
    penjelasan:
      "Anda bisa melihat isi halaman ini, tetapi tidak bisa mengubah atau menjalankan tindakan. Hak tindakan diberikan admin lewat penugasan gudang.",
  },
  periodeSumber: {
    judul: "Periode sumber",
    penjelasan:
      "Bulan laporan yang dipakai gudang sebagai dasar rata-rata untuk menghitung kebutuhan. Ditetapkan admin per gudang dan terpisah dari pilihan bulan di Ringkasan.",
  },
  perluDihitungUlang: {
    judul: "Perlu dihitung ulang",
    penjelasan:
      "Stok akhir yang sudah diisi tetap disimpan saat draft dihitung ulang. Stok untuk toko atau varian yang tidak ada lagi di draft ditampilkan sebagai keterangan dan dipakai kembali jika toko atau varian itu muncul lagi.",
  },
  fileStok: {
    judul: "File stok",
    penjelasan:
      "Ekspor stok akhir kasir untuk toko ini: CSV berpemisah titik koma (;) atau Excel (.xlsx, sheet pertama), maksimal 1 MB, dengan judul kolom Name - Variant dan Ending.",
  },
  mingguLaporan: {
    judul: "Minggu dan bulan laporan",
    penjelasan:
      "Label di atas setiap baris kalender menunjukkan minggu dan bulan laporan; satu baris bisa memiliki dua label. Bulan dan minggu laporan tetap, walaupun kategori tanggal diubah admin.",
  },
} as const satisfies Record<string, { judul: string; penjelasan: string }>;

export type IstilahBantuan = keyof typeof TEKS_BANTUAN_ISTILAH;
