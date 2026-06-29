# SNAPBOX — Web Photobooth Custom Branding

Proyek photobooth digital berbasis web (HTML, CSS, JavaScript murni — tanpa framework, tanpa build step). Dibuat untuk kebutuhan praktik mata kuliah Kewirausahaan: mensimulasikan layanan photobooth sewa yang bisa dikustomisasi brandingnya untuk tiap event/klien.

## Cara menjalankan

Karena fitur kamera (`getUserMedia`) memerlukan konteks aman, file **tidak bisa** dibuka langsung lewat `file://`. Jalankan lewat server lokal:

```bash
# opsi 1: Python
cd photobooth
python3 -m http.server 8000
# buka http://localhost:8000

# opsi 2: Node (jika punya npx)
npx serve .
```

Lalu buka di browser modern (Chrome/Edge/Safari terbaru) dan **izinkan akses kamera** saat diminta. Disarankan diakses lewat `localhost` atau domain HTTPS — browser memblokir kamera di koneksi HTTP biasa selain localhost.

## Struktur file

```
photobooth/
├── index.html        → seluruh struktur halaman (6 layar/step)
├── style.css         → semua styling & desain visual
├── app.js            → seluruh logika (state, kamera, edit, checkout, dst.)
├── README.md         → dokumen ini
└── server/           → backend kecil khusus untuk mengirim email lewat Resend
    ├── server.js      → kode backend (Express + resend)
    ├── package.json   → daftar dependency backend
    └── .env.example   → contoh file konfigurasi (salin jadi .env, isi API key)
```

Bagian utama (`index.html`, `style.css`, `app.js`) tetap murni front-end dan bisa dijalankan tanpa backend sama sekali — kecuali fitur kirim email via Resend, yang memang mengharuskan folder `server/` dijalankan (lihat bagian "Email" di bawah).

Sengaja dibuat 1 halaman (single page) dengan beberapa "screen" yang disembunyikan/ditampilkan via class `is-active`, supaya mudah dijalankan di perangkat touchscreen / kiosk tanpa perlu routing yang rumit — cocok untuk demo tugas maupun MVP usaha riil.

## Fitur yang sudah diimplementasikan

| Kebutuhan | Implementasi |
|---|---|
| Branding custom (warna, nama, logo, latar, tagline) | Layar "Branding" — tersimpan di `localStorage`, langsung terlihat di seluruh sesi |
| Pilih frame foto | 7 frame bawaan (polaroid, film strip, neon, scallop, dst.) |
| Tambah frame sendiri | Tombol "+ Tambah frame custom" → upload gambar PNG transparan sebagai overlay |
| Layout 1 / 2 / strip 3 / grid 4 foto | Toggle di layar Frame |
| Timer otomatis 3 / 5 detik atau manual | Tombol pill di layar Kamera |
| Retake | Tab "Retake" di layar Edit → pilih foto → ambil ulang, otomatis balik ke Edit |
| Filter & efek | Filter di layar Edit (BW, Hangat, Sejuk, Sepia, Vivid) + slider Brightness/Contrast/Saturation, juga efek *live* saat di kamera |
| Stiker & teks | Tab Stiker (emoji, drag-and-drop) dan Tab Teks (custom font + warna) |
| Download JPG & PNG | Tombol di layar Hasil, langsung dari `<canvas>` |
| Kirim ke email | Form di layar Checkout & Hasil, lewat Resend (lihat catatan integrasi di bawah) |
| QR code untuk unduh | Otomatis dibuat di layar Hasil memakai library `qrcode.js` |
| Flash | Toggle "Flash" → efek kilat putih di layar saat jepret (flash layar, tidak butuh hardware) |
| Mirror | Toggle "Mirror" → membalik tampilan kamera secara horizontal |
| Sistem pembayaran | Layar Checkout: ringkasan harga, kode promo, 4 metode bayar (QRIS/E-wallet/Kartu/Tunai) |
| **Laporan transaksi** | Tombol "📊 Laporan" di pojok atas → masuk PIN → tabel riwayat transaksi, ringkasan total, filter tanggal, export CSV |

## Laporan Transaksi

Setiap kali pembayaran di layar Checkout berhasil (atau "selesai" dalam mode simulasi), datanya otomatis tersimpan ke `localStorage` perangkat itu — tidak perlu setting apa pun.

**Cara mengaksesnya:**
1. Klik tombol **"📊 Laporan"** di pojok kanan atas
2. Masukkan PIN (default: `1234`)
3. Akan tampil:
   - Ringkasan: total transaksi, total pendapatan, rata-rata per transaksi, metode bayar terbanyak
   - Tabel rinci tiap transaksi (tanggal, kode pesanan, layout foto, metode bayar, email, total)
   - Filter berdasarkan tanggal tertentu
   - Tombol **Export CSV** — file langsung bisa dibuka di Excel/Google Sheets
   - Tombol **Hapus semua data** (kalau mau reset, misal sebelum demo ke dosen agar datanya bersih)

**Ganti PIN default**: buka `app.js`, cari baris:
```js
const REPORT_PIN = "1234";
```
ganti angkanya sesuai keinginan, lalu simpan file.

**Penting untuk dipahami**: PIN ini hanya pengaman ringan (mencegah pengunjung booth biasa mengintip data penjualan), **bukan keamanan tingkat enterprise** — karena PIN-nya tertulis langsung di kode JavaScript yang bisa dibaca lewat DevTools browser oleh siapa pun yang cukup paham teknis. Untuk kebutuhan nyata dengan banyak operator/kasir dan data sensitif, sebaiknya laporan dipindah ke backend dengan login & database sungguhan — tapi untuk skala tugas kuliah/UMKM kecil dengan satu perangkat, ini sudah lebih dari cukup.

**Data tersimpan per perangkat/browser** — kalau photobooth dipakai di beberapa device (misal 2 kios sekaligus), masing-masing punya laporan terpisah karena `localStorage` tidak sinkron antar perangkat. Kalau butuh laporan terpusat dari banyak device, datanya perlu dikirim ke backend + database (bisa dikembangkan dari folder `server/` yang sudah ada untuk Resend).

## Tentang simulasi pembayaran & email (penting untuk dipahami)

### Email — sudah disambungkan ke Resend (butuh backend kecil, dan memang harus begitu)

Tombol "Kirim" di layar Hasil memanggil **Resend**, layanan email transaksional yang lebih modern dibanding SendGrid (API-nya lebih sederhana, dashboard lebih ringkas). Sama seperti penyedia email transaksional lainnya: **Resend tidak bisa dipanggil langsung dari browser dengan aman** — API key harus disimpan di server, bukan di kode JavaScript yang bisa dibaca lewat DevTools browser. Karena itu, project ini sudah disiapkan dengan **backend kecil** di folder `server/` yang menjadi perantara antara halaman web dan Resend.

Kelebihannya: foto bisa dilampirkan sebagai attachment sungguhan secara gratis — jadi email yang dikirim akan benar-benar membawa file foto, bukan cuma info pesanan.

**Cara mengaktifkannya:**

1. **Daftar Resend** di [resend.com](https://resend.com) (gratis, kuota 100 email/hari & 3.000 email/bulan di tier gratis)
2. Di dashboard, buka **API Keys** → **Create API Key** → beri nama (misal "snapbox") → copy key-nya (diawali `re_...`, hanya ditampilkan sekali!)
3. Untuk testing cepat, **tidak perlu verifikasi domain** — Resend menyediakan alamat pengirim siap pakai: `onboarding@resend.dev`. (Kalau nanti mau pakai email/domain usahamu sendiri, verifikasi dulu di dashboard → Domains, lalu ikuti instruksi DNS yang diberikan.)
4. Jalankan backend-nya di komputermu:
   ```bash
   cd server
   npm install
   cp .env.example .env
   ```
5. Buka file `server/.env`, isi:
   ```
   RESEND_API_KEY=isi_dengan_api_key_dari_langkah_2
   SENDER_EMAIL=onboarding@resend.dev
   ```
   (atau ganti `SENDER_EMAIL` dengan domain sendiri kalau sudah diverifikasi di langkah 3)
6. Jalankan servernya:
   ```bash
   npm start
   ```
   Kalau berhasil, akan muncul `Snapbox email backend (Resend) jalan di http://localhost:4000`
7. Buka `app.js` (folder utama project, bukan folder `server`), cari baris ini lalu isi:
   ```js
   const API_BASE_URL = "http://localhost:4000";
   ```
8. Simpan, refresh halaman web utama (pastikan backend di langkah 6 masih berjalan di terminal terpisah). Tombol "Kirim" sekarang benar-benar mengirim email lewat Resend, lengkap dengan foto terlampir.

**Catatan tentang `onboarding@resend.dev`**: alamat ini bagus untuk testing/demo (termasuk demo ke dosen), tapi untuk dipakai usaha sungguhan ke pelanggan asli, sebaiknya verifikasi domain sendiri di Resend supaya email tidak masuk folder spam dan terlihat profesional (misal `noreply@namabrand.com`).

**Untuk dipakai online (bukan cuma di laptop sendiri)**: backend di folder `server/` perlu di-deploy ke hosting seperti Railway, Render, atau Vercel (gratis untuk skala kecil), lalu `API_BASE_URL` di `app.js` diganti dengan alamat hasil deploy itu (misal `https://snapbox-backend.up.railway.app`). Selama backend masih hanya jalan di `localhost`, fitur ini hanya akan berfungsi di komputer yang sama dengan yang menjalankan server.

**Catatan keamanan**: jangan pernah upload file `server/.env` (yang sudah berisi API key asli) ke GitHub atau tempat publik manapun. File `.env.example` aman dibagikan karena masih kosong.

### Pembayaran (QRIS, e-wallet, kartu)

**QRIS**: sejak update ini, kamu bisa upload **gambar QRIS asli milik usahamu** di layar Branding (field "QRIS pembayaran"). Begitu diupload, layar Checkout otomatis menampilkan QRIS asli itu — bukan QR contoh — dan pembayaran yang masuk lewat situ benar-benar nyata sampai ke rekening/akun e-wallet kamu, persis seperti QRIS yang biasa dipajang di kasir toko.

Kalau belum punya QRIS sendiri, cara mendapatkannya **gratis dan cepat** untuk usaha kecil/UMKM:
- Daftar lewat aplikasi **GoPay Merchant**, **DANA Bisnis**, atau **OVO Merchant** — isi data usaha, biasanya selesai dalam hitungan menit, langsung dapat QRIS yang bisa di-screenshot.
- Atau lewat bank (BCA, BRI, Mandiri, dst.) yang juga menyediakan QRIS merchant.

Yang **tidak bisa** dilakukan murni dari kode web ini: membuat QRIS dari nol secara otomatis tanpa pendaftaran resmi. QRIS adalah standar resmi Bank Indonesia — pembuatannya selalu lewat bank atau penyelenggara berizin (PJSP), butuh verifikasi data usaha (KTP, NPWP/SIUP). Tidak ada library atau API gratis yang bisa melewati proses ini, dan sebaiknya dihindari karena menyangkut aliran uang sungguhan.

Kalau proyek ini untuk skala UMKM/event kecil dan transaksi tunai/manual masih cukup, opsi "Tunai di kasir" yang sudah ada di Checkout juga sudah memadai untuk demo maupun penggunaan riil skala kecil.

**E-wallet & Kartu**: kedua metode ini masih berupa form simulasi (belum proses transaksi sungguhan), karena keduanya butuh payment gateway resmi (Midtrans/Xendit) yang mengharuskan verifikasi bisnis serupa QRIS. Panduan teknis menyambungkannya ada di bagian "Cara menyambungkannya ke transaksi sungguhan" di bawah.

### Cara menyambungkan e-wallet/kartu ke payment gateway sungguhan (untuk pengembangan lanjutan / demo investor)

**Payment gateway (disarankan: Midtrans atau Xendit — populer di Indonesia, mendukung QRIS, e-wallet, kartu)**

1. Buat akun sandbox di [midtrans.com](https://midtrans.com) atau [xendit.co](https://xendit.co), dapatkan Server Key & Client Key.
2. Buat endpoint baru di backend yang sudah ada di folder `server/` (boleh ditambahkan di `server.js` yang sama dengan endpoint Resend), contoh:
   ```js
   // tambahan di server/server.js (contoh konsep)
   app.post('/api/create-transaction', async (req, res) => {
     const { total, orderCode } = req.body;
     const transaction = await midtransClient.createTransaction({
       transaction_details: { order_id: orderCode, gross_amount: total },
       // ...
     });
     res.json(transaction); // berisi snap_token atau qr_string
   });
   ```
3. Di `app.js`, ganti isi `setTimeout` pada `btnPayNow` dengan `fetch('/api/create-transaction', {...})`, lalu tampilkan QR/redirect sesuai respons asli dari gateway.
4. Gunakan webhook dari gateway untuk mengonfirmasi status bayar benar-benar berhasil sebelum mengizinkan `goTo("result")`.

Bagian front-end (UI, validasi form, animasi status) yang sudah ada di proyek ini **tidak perlu diubah** — cukup ganti isi `setTimeout` simulasi dengan `fetch` ke backend asli.

## Kustomisasi cepat

- **Ubah harga default**: edit `state.order.basePrice`, `extraCopyPrice`, `hqPrice` di awal `app.js`.
- **Tambah kode promo**: tambahkan entri baru di objek `PROMO_CODES` (cth: `"PROMOBARU": 25` untuk diskon 25%).
- **Tambah frame bawaan baru**: tambahkan entri di array `BUILTIN_FRAMES` + tambahkan `case` baru di fungsi `frameSwatchStyle()` dan `drawCellFrame()`.
- **Ganti warna default brand**: ubah `--accent` di `style.css` atau `state.branding.color` di `app.js`.

## Catatan teknis

- Kamera memakai `navigator.mediaDevices.getUserMedia` (API standar web, didukung semua browser modern).
- Komposisi foto akhir (frame + filter + stiker) digambar ke `<canvas>` lalu diekspor lewat `canvas.toDataURL()` — itulah cara unduh JPG/PNG bekerja tanpa server.
- QR code dibuat di sisi klien memakai library [`qrcode.js`](https://github.com/soldair/node-qrcode) via CDN, tanpa perlu API eksternal.
- Branding (warna, nama, logo, dst.) disimpan di `localStorage` browser — artinya pengaturan akan tetap ada saat halaman di-refresh, tapi khusus di perangkat/browser itu saja. Untuk multi-kios (beberapa booth dengan branding sama), pengaturan sebaiknya dipindahkan ke backend/database.
