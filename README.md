# 🏫 SIMINBAR (Sistem Informasi Manajemen Inventaris Barang)

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Access](https://img.shields.io/badge/access-INTERNAL%20ONLY%20(SMK%20Negeri%203%20Tuban)-red)
![Stack](https://img.shields.io/badge/stack-Node.js%20%7C%20Express%20%7C%20EJS%20%7C%20Firebase-green)
![Context](https://img.shields.io/badge/context-Kerja%20Praktek-orange)

> ⚠️ **PERINGATAN AKSES & KERAHASIAAN**: Aplikasi ini adalah sistem internal yang dikembangkan khusus untuk kebutuhan administrasi di **SMK Negeri 3 Tuban**. Akses dibatasi hanya untuk Administrator/Petugas Inventaris. Dilarang keras mendistribusikan kredensial, data inventaris, atau sumber kode aplikasi ini kepada pihak yang tidak berwenang.

## 📖 Deskripsi
**SIMINBAR** adalah aplikasi berbasis web yang dirancang untuk mendigitalisasi proses pengelolaan inventaris dan peminjaman perangkat (*device*) di lingkungan SMK Negeri 3 Tuban. Sistem ini dikembangkan untuk menggantikan metode pencatatan manual (buku inventaris dan lembar peminjaman fisik) yang rawan terhadap kesalahan pencatatan, kehilangan arsip, dan inefisiensi waktu.

Dengan SIMINBAR, proses pendataan barang, peminjaman, pengembalian, hingga pembuatan laporan dapat dilakukan secara terkomputerisasi, terstruktur, dan *real-time*, sehingga mendukung kelancaran kegiatan belajar mengajar dan operasional sekolah.

## ✨ Fitur Utama
- 📦 **Manajemen Device (CRUD):** Penambahan, pengeditan, penghapusan, dan pencarian data inventaris lengkap dengan kategori, kondisi, lokasi, dan foto barang.
- 📱 **Generasi QR Code Otomatis:** Setiap perangkat yang ditambahkan akan otomatis menghasilkan QR Code unik sebagai identitas digital untuk mempermudah identifikasi dan pelacakan.
- 📝 **Peminjaman & Pengembalian:** Pencatatan data peminjam, periode pinjaman, dan form pengembalian dengan penilaian kondisi *device* (Baik, Rusak Ringan, Rusak Sedang, Rusak).
- 📄 **Cetak Surat Peminjaman PDF:** Sistem secara otomatis menghasilkan surat peminjaman barang dalam format PDF yang siap cetak sebagai bukti administrasi resmi.
- 📊 **Dashboard & Statistik Real-time:** Menampilkan ringkasan total *device*, *device* tersedia, *device* dipinjam, serta visualisasi grafik (*Pie Chart*) kondisi perangkat dan riwayat peminjaman.
- 🔐 **Autentikasi Aman:** Sistem login khusus untuk Admin/Petugas. Tidak ada fitur registrasi publik untuk menjaga keamanan data sekolah.

## 🛠️ Teknologi yang Digunakan
- **Backend:** Node.js, Express.js
- **Frontend:** EJS (Embedded JavaScript Templates), HTML5, CSS3 (Tailwind/Bootstrap)
- **Database:** Firebase Firestore (NoSQL Document Database)
- **Utilities & Libraries:** 
  - `qrcode` (Pembuatan QR Code)
  - `PDFKit` (Generasi dokumen PDF)
  - `Multer` (Penanganan *upload* foto *device*)

## 📋 Persyaratan Sistem (Prerequisites)
Sebelum menjalankan proyek ini, pastikan lingkungan pengembangan Anda telah terinstal:
- [Node.js](https://nodejs.org/) (versi 18.x atau lebih baru)
- [npm](https://www.npmjs.com/) atau [Yarn](https://yarnpkg.com/)
- Akun [Firebase](https://console.firebase.google.com/) dengan proyek yang sudah dibuat dan fitur **Firestore Database** diaktifkan.

## 🚀 Cara Instalasi & Menjalankan (Local Development)

### 1. Clone Repositori
```bash
git clone https://github.com/[username-anda]/siminbar-smkn3.git
cd siminbar-smkn3
