# Dashboard Penjualan MANDALIKA

Mengubah data penjualan harian toko menjadi laporan rata-rata bertahap, lalu memakainya untuk merencanakan jumlah barang yang dikirim dari gudang ke toko.

## Organisasi dan pengguna

**Gudang**:
Tempat asal pengiriman barang ke toko. Daftarnya dikelola admin (data awal: Pusat dan empat lainnya). Tidak dihapus, hanya dinonaktifkan.
_Avoid_: depo, warehouse

**Pusat**:
Nama salah satu gudang. Bukan peran.
_Avoid_: memakai "pusat" untuk admin

**Toko**:
Gerai penjualan yang muncul sebagai blok kolom di sheet penjualan (misalnya PMS, PMJ) dan dapat dihubungkan ke gudang. Dikelola admin; namanya harus sama persis dengan nama blok di sheet. Tidak dihapus, hanya dinonaktifkan.
_Avoid_: outlet, store

**Admin**:
Peran yang mengelola gudang, toko, hubungan toko, jadwal tetap, penugasan operator, hak tindakan, ranking pusat, periode sumber, dan persetujuan. Admin tidak otomatis menjadi operator.

**Operator**:
Pengguna yang ditugaskan ke gudang tertentu untuk mengusulkan pengiriman di luar jadwal, mengisi stok, menghitung, memfinalisasi, dan mengekspor sesuai hak tindakannya.

**Viewer**:
Pengguna yang hanya melihat laporan sesuai haknya.

**Hak tindakan**:
Izin per operator per gudang untuk satu jenis tindakan (misalnya memfinalisasi atau mengekspor).

## Impor penjualan

**Sheet penjualan**:
Sheet workbook berpola `<BULAN> (S)` dengan A1 `SALES`, berisi kuantitas harian per produk dan per toko.
_Avoid_: sheet BARDAT, sheet MP (keduanya di luar scope)

**Impor**:
Satu kali pembacaan satu sheet dari satu file, dengan status, hasil validasi, dan identitas file.
_Avoid_: upload (untuk menyebut hasilnya)

**Impor aktif**:
Impor yang menjadi sumber laporan untuk bulan impornya. Hanya satu per bulan impor.

**Bulan impor**:
Bulan kalender yang dicakup sebuah sheet penjualan.
_Avoid_: menyamakannya dengan bulan laporan

**Pengamatan**:
Kuantitas suatu produk–toko pada tanggal yang termasuk cakupan tanggal sebuah impor aktif. Bisa berupa angka terisi atau nol tersirat.

**Nol tersirat**:
Sel kosong pada tanggal valid di sheet penjualan; bernilai nol dan teramati.

**Tidak tersedia**:
Tanggal yang tidak ada di cakupan tanggal impor aktif mana pun. Tidak pernah dianggap nol.

**Kolom tanggal invalid**:
Kolom tanggal di sheet yang bukan tanggal kalender nyata (misalnya `31/6`).

## Kalender

**Kategori dasar**:
Kategori hari menurut tanggal sebenarnya: Senin–Kamis, Jumat, Sabtu, atau Minggu.

**Kategori efektif**:
Kategori yang dipakai untuk menghitung: perubahan khusus toko, lalu perubahan semua-toko, lalu kategori dasar.

**Perubahan kategori**:
Penggantian kategori satu tanggal oleh admin, dengan alasan, cakupan (semua toko atau satu toko), revisi, dan status.

**Tanggal acuan**:
Kamis di minggu yang sama untuk Senin–Kamis; tanggal itu sendiri untuk Jumat sampai Minggu.

**Bulan laporan**:
Bulan dari tanggal acuan.

**Minggu laporan**:
⌈hari tanggal acuan / 7⌉ dalam bulan laporan.
_Avoid_: ISO week, baris kalender

**Snapshot libur**:
Daftar libur satu tahun hasil sinkronisasi API, menunggu persetujuan admin sebelum aktif.

## Laporan

**Nilai mingguan**:
Hasil tahap pertama per produk–toko, kategori, bulan laporan, dan minggu laporan.

**Rata-rata bulanan**:
Hasil tahap kedua per produk–toko, kategori, dan bulan laporan.

**Rata-rata Ringkasan**:
Hasil tahap ketiga lintas bulan pilihan.

**Pembagi**:
Bilangan yang membagi suatu jumlah dalam satu tahap. Selalu ditampilkan bersama jumlahnya.

**Total penjualan mentah**:
Jumlah kuantitas teramati tanpa perataan.
_Avoid_: menyebutnya "total" tanpa kata "mentah", atau menjumlahkan rata-rata dan menamainya total

**Penanda kelengkapan**:
Tanda bahwa suatu nilai dihitung dari pengamatan parsial.

## Pengiriman gudang

**Periode sumber**:
Bulan laporan yang dipakai gudang sebagai dasar rata-rata. Ditetapkan admin per gudang.
_Avoid_: bulan ranking, filter Ringkasan

**Jadwal tetap**:
Pengaturan hari pengiriman rutin satu toko (pola, hari kirim, persiapan, tanggal jangkar). Hanya satu yang aktif per toko. Diatur admin. Disebut "jadwal aktif" di teks lama.
_Avoid_: template (kecuali menjelaskan ke pemilik), jadwal usulan

**Pengiriman di luar jadwal**:
Satu pengiriman untuk satu toko pada satu tanggal yang tidak mengubah jadwal tetap. Jenisnya **tambahan** (pengiriman rutin tetap berjalan) atau **pindah** (satu tanggal rutin dipindah ke tanggal lain). Diusulkan operator; di gudang selain Pusat berlaku setelah disetujui admin. Status: menunggu, berlaku, ditolak, ditarik, dibatalkan.
_Avoid_: usulan jadwal, pengiriman khusus, pengecualian

**Usulan jadwal**:
Alur lama (sebelum 2026-10-13): perubahan jadwal tetap yang diusulkan operator dan disetujui admin. Sudah dihapus; datanya tetap ada sebagai riwayat.

**Tanggal kirim (H)**:
Tanggal barang dikirim dari gudang.

**Tanggal kirim toko**:
Daftar tanggal kirim satu toko: tanggal menurut jadwal tetap, dikurangi tanggal rutin yang dipindah, ditambah tanggal pengiriman di luar jadwal yang berlaku.

**Persiapan (p)**:
0, 1, atau 2 hari sebelum H.

**Cakupan**:
Rentang tanggal H−p sampai H+L−1, inklusif.

**Panjang cakupan (L)**:
Jumlah hari dari tanggal kirim sampai sehari sebelum tanggal kirim berikutnya menurut tanggal kirim toko (1× seminggu 7, dua mingguan 14, 2×/3× seminggu selisih ke hari kirim berikutnya); khusus 1× sebulan 30, tetapi berakhir lebih awal jika ada pengiriman di luar jadwal sebelum hari ke-30.
_Avoid_: menganggap L selalu 7 untuk pola mingguan

**Tanggal jangkar**:
Tanggal yang menentukan pekan kirim untuk pola dua mingguan.

**Kebutuhan barang**:
Jumlah rata-rata sesuai kategori efektif setiap tanggal dalam cakupan.

**Stok akhir**:
Stok toko yang diisi operator. Jika kosong, berarti belum diketahui.

**File stok**:
Ekspor stok akhir satu toko dari sistem kasir (CSV `;` atau `.xlsx`) dengan kolom `Name - Variant`, `Category`, `Ending`.
_Avoid_: menganggap nama produk di dalamnya sama dengan nama master

**Alias nama stok**:
Nama produk di file stok yang dipetakan admin ke tepat satu kode produk. Nama master adalah alias bawaan. Dicocokkan persis setelah normalisasi.
_Avoid_: pencocokan mirip/fuzzy

**Unggah stok**:
Membaca satu file stok untuk satu toko di draft rencana menjadi isian stok yang belum disimpan.
_Avoid_: menganggap hasil unggahan sudah tersimpan

**Buffer**:
Persen tambahan: 20 untuk keluarga aroma tujuh besar, 10 untuk produk otomatis lainnya.

**Stok target**:
⌈kebutuhan × (1 + buffer)⌉: stok yang diharapkan ada di toko setelah kiriman datang.

**Jumlah kirim**:
max(0, stok target − stok akhir) = max(0, ⌈kebutuhan × (1 + buffer)⌉ − stok akhir). Buffer dikenakan pada seluruh kebutuhan (PRD A6 ▶ Revisi 2026-10-14).
_Avoid_: ⌈(kebutuhan − stok akhir) × (1 + buffer)⌉ (rumus lama, hanya untuk rencana final sebelum 2026-10-14)

**Ranking pusat**:
Urutan keluarga aroma dari file yang dipublikasikan admin, dengan bulan ranking dan versi. Setiap baris file ranking adalah satu keluarga aroma (kelompok ranking). Yang berlaku untuk semua gudang adalah ranking terakhir yang dipublikasikan.

**Bulan ranking**:
Bulan yang melekat pada satu versi ranking pusat.

**Keluarga aroma**:
Kelompok varian yang menjadi satu baris di file ranking pusat, dipetakan oleh admin. Biasanya varian dengan aroma yang sama (misalnya Gorgeous Tuberose), tetapi tidak selalu aroma: GIFT SET BOX (produk kotak hadiah) juga satu kelompok.
_Avoid_: menebaknya dari kemiripan nama

**Varian**:
Satu produk dengan satu kode produk.
_Avoid_: SKU dan produk dipakai bergantian tanpa kode

**Varian rework**:
Varian berakhiran `-R`. SKU tersendiri dalam keluarga aroma yang sama.

**Produk manual**:
Display tester (kode `-T`) dan kertas tester (kategori `KTP`/`KTL`). Tanpa jumlah kirim dan tanpa buffer otomatis.

**Produk otomatis**:
Semua produk selain produk manual.

**Draft rencana**:
Hasil hitung kebutuhan yang belum final. Bisa ditandai perlu dihitung ulang.

**Finalisasi**:
Menyimpan rencana beserta snapshot semua masukannya. Bukan konfirmasi pengiriman fisik.
_Avoid_: kirim, terima

**Rencana final**:
Rencana yang sudah difinalisasi. Tidak berubah oleh perubahan data berikutnya.
