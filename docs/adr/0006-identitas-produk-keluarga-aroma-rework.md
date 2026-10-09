# Identitas produk = kode; keluarga aroma lewat pemetaan yang dikonfirmasi admin; rework = varian terpisah

Status: accepted (2026-10-08) — rekomendasi yang didelegasikan pemilik

**Kode produk** adalah identitas varian. Nama produk hanya label tampilan, dan ketidakcocokan nama tidak mengubah identitas.

Setiap produk punya status keluarga aroma: *terpetakan* (ke satu keluarga), *tanpa aroma* (eksplisit, misalnya BOX atau ALKOHOL), atau *belum dipetakan*. Sistem boleh **mengusulkan** keluarga dari pola kode, tetapi usulan baru berlaku setelah admin mengonfirmasinya. Pola kode tidak seragam (misalnya `DD-HAM120-MRF` menaruh aromanya di posisi ketiga), sehingga parsing otomatis saja tidak aman. Produk otomatis yang *belum dipetakan* menahan finalisasi, karena status tujuh besar dan buffernya tidak boleh ditebak. Baris file ranking dicocokkan ke keluarga aroma lewat tabel alias dengan pencocokan persis setelah normalisasi (huruf besar, spasi dirapikan). Baris yang tidak cocok menahan publikasi ranking.

Varian **rework** (akhiran `-R`) adalah SKU tersendiri, dengan penjualan, stok, dan jumlah kirim sendiri. Datanya tidak digabung dengan varian non-rework. Untuk buffer ranking, rework termasuk keluarga aroma yang sama dengan varian non-rework-nya.

Kode produk baru yang muncul saat impor didaftarkan ketika impor diaktifkan, dengan status keluarga aroma *belum dipetakan*, dan ditampilkan di halaman tinjau impor sebagai "produk baru".

## Revisi 2026-10-09 (keputusan pemilik putaran 4)

- "Keluarga aroma" dibaca sebagai "kelompok ranking": setiap baris file ranking adalah satu kelompok, termasuk yang bukan aroma.
- BOX kemasan (misalnya BOX UK S) tetap berstatus *tanpa aroma*.
- GIFT SET BOX (produk GIFT SET BOX - HITAM dan GIFT SET BOX - PUTIH) adalah kelompok ranking sendiri, bukan *tanpa aroma*.
