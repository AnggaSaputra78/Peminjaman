// server.js
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import { db } from "./firebase.js";
import { authRouter, requireLogin } from "./auth.js";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = 3000;

// -------------------------------
// Upload directory
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// -------------------------------
// Multer config
const storage = multer.diskStorage({
  destination(req, file, cb) { cb(null, UPLOAD_DIR); },
  filename(req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)); },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Hanya file gambar yang diizinkan"), false);
    cb(null, true);
  },
});

// -------------------------------
// Middleware & view engine
app.set("view engine", "ejs");
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// mount auth router (login/register/logout)
app.use("/", authRouter);

// -------------------------------
// Helpers
function toDateSafe(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  return new Date(val);
}

function clean(obj) {
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(v => clean(v));
  if (typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null) { out[k] = null; continue; }
    out[k] = (typeof v === "object") ? clean(v) : v;
  }
  return out;
}

// Error handler (simple)
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  if (res.headersSent) return next(err);
  res.status(500).send("Server error: " + (err.message || err));
});

// -------------------------------
// Halaman utama (index)
app.get("/", requireLogin, async (req, res, next) => {
  try {
    const search = req.query.search ? req.query.search.toLowerCase() : "";
    const typeFilter = req.query.type ? req.query.type.toLowerCase() : "";

    // ambil devices
    const snapshotDevices = await db.collection("devices").get();
    let devicesRaw = snapshotDevices.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (search) {
      devicesRaw = devicesRaw.filter(d =>
        (d.name && d.name.toLowerCase().includes(search)) ||
        (d.type && d.type.toLowerCase().includes(search))
      );
    }
    if (typeFilter) {
      devicesRaw = devicesRaw.filter(d => d.type && d.type.toLowerCase() === typeFilter);
    }

    const devices = await Promise.all(devicesRaw.map(async d => {
      try {
        const qr = d.qrcode || await QRCode.toDataURL(String(d.id));
        return { ...d, qr };
      } catch {
        return { ...d, qr: null };
      }
    }));

    // ambil borrowings (data peminjaman baru)
    const snapshotBorrowings = await db.collection("borrowings").orderBy("created_at", "desc").get();
    const borrowings = snapshotBorrowings.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data, 
        created_at: toDateSafe(data.created_at),
        // Untuk kompatibilitas dengan template yang mengharapkan field-field tertentu
        deviceId: data.device_id,
        deviceName: data.device_name,
        type: data.device_type,
        borrower: data.borrower_name,
        location: data.return_info,
        borrowedAt: data.created_at
      };
    });

    // ambil loans (peminjaman lama - untuk kompatibilitas)
    const snapshotLoans = await db.collection("loans").orderBy("created_at", "desc").get();
    const loans = snapshotLoans.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data, created_at: toDateSafe(data.created_at) };
    });

    res.render("index", { 
      devices, 
      borrowings, 
      loans, 
      search, 
      typeFilter, 
      user: req.session?.user || null,
      message: req.query.message 
    });
  } catch (err) {
    next(err);
  }
});

// FORM PEMINJAMAN DENGAN DEVICE TERTENTU
app.get('/peminjaman/create/:deviceId', requireLogin, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const snapshot = await db.collection('devices').get();
    const devices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const selectedDevice = devices.find(d => d.id === deviceId);

    res.render('peminjaman_form', { devices, selectedDevice });
  } catch (err) {
    console.error("Error load form peminjaman by device:", err);
    res.status(500).send("Gagal memuat form peminjaman");
  }
});

// SIMPAN PEMINJAMAN DAN PREVIEW - DENGAN PENYIMPANAN KE TABEL
app.post("/peminjaman/store", requireLogin, async (req, res) => {
  try {
    const { borrower_name, device_id, borrow_date, return_info } = req.body;

    if (!borrower_name || !device_id) {
      return res.status(400).send("Nama peminjam dan device wajib diisi");
    }

    // Ambil detail device
    const deviceRef = db.collection("devices").doc(device_id);
    const deviceDoc = await deviceRef.get();

    if (!deviceDoc.exists) {
      return res.status(404).send("Device tidak ditemukan");
    }

    const deviceData = deviceDoc.data();

    // Buat data peminjaman untuk koleksi 'borrowings'
    const borrowingData = {
      borrower_name,
      device_id: device_id,
      device_name: deviceData.name,
      device_type: deviceData.type,
      borrow_date: borrow_date || new Date().toISOString().split('T')[0],
      return_info: return_info || "",
      created_at: new Date(),
      status: "active"
    };

    // Simpan ke Firestore collection 'borrowings'
    const borrowingRef = await db.collection("borrowings").add(borrowingData);
    const borrowingId = borrowingRef.id;

    // Juga simpan ke collection 'loans' untuk kompatibilitas dengan tampilan utama
    const loanData = {
      deviceId: device_id,
      deviceName: deviceData.name,
      type: deviceData.type,
      photo: deviceData.photo || null,
      qrcode: deviceData.qrcode || null,
      borrowedAt: new Date(),
      returnedAt: null,
      borrower: borrower_name,
      location: return_info || "",
      created_at: new Date()
    };

    await db.collection("loans").add(loanData);

    // Render preview dengan data peminjaman
    res.render("peminjaman_preview", {
      peminjaman: { 
        id: borrowingId, 
        ...borrowingData 
      }
    });

  } catch (err) {
    console.error("Error saat simpan peminjaman:", err);
    res.status(500).send("Terjadi kesalahan saat menyimpan data peminjaman.");
  }
});

// KONFIRMASI PENYIMPANAN PEMINJAMAN
app.post("/peminjaman/confirm/:id", requireLogin, async (req, res) => {
  try {
    const peminjamanId = req.params.id;
    
    // Update status peminjaman menjadi confirmed
    await db.collection("borrowings").doc(peminjamanId).update({
      status: "confirmed",
      confirmed_at: new Date()
    });
    
    // Redirect ke halaman utama dengan pesan sukses
    res.redirect("/?message=Peminjaman berhasil disimpan");
    
  } catch (error) {
    console.error('Error confirming loan:', error);
    res.status(500).send('Terjadi kesalahan saat mengonfirmasi peminjaman');
  }
});

// PREVIEW PEMINJAMAN BERDASARKAN ID
app.get('/peminjaman/preview/:id', requireLogin, async (req, res) => {
  try {
    const peminjamanId = req.params.id;
    const peminjamanDoc = await db.collection("borrowings").doc(peminjamanId).get();
    
    if (!peminjamanDoc.exists) {
      return res.status(404).send('Data peminjaman tidak ditemukan');
    }
    
    const peminjamanData = peminjamanDoc.data();
    
    res.render('peminjaman_preview', { 
      peminjaman: { 
        id: peminjamanDoc.id, 
        ...peminjamanData 
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Terjadi kesalahan server');
  }
});

// DOWNLOAD PDF SURAT PEMINJAMAN DENGAN QR CODE YANG DIPERBAIKI
app.get('/peminjaman/download/:id', requireLogin, async (req, res) => {
  try {
    const peminjamanId = req.params.id;
    const peminjamanDoc = await db.collection("borrowings").doc(peminjamanId).get();
    
    if (!peminjamanDoc.exists) {
      return res.status(404).send('Data peminjaman tidak ditemukan');
    }
    
    const peminjaman = peminjamanDoc.data();
    
    // Buat data untuk QR Code dengan link verifikasi
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;
    const verifyUrl = `${baseUrl}/peminjaman/verify/${peminjamanId}`;
    
    const qrText = `VERIFIKASI PEMINJAMAN DEVICE
ID: ${peminjamanId}
Peminjam: ${peminjaman.borrower_name}
Device: ${peminjaman.device_name}
Tanggal: ${peminjaman.borrow_date}
Status: ${peminjaman.status || 'active'}

Verifikasi: ${verifyUrl}`;
    
    // Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(qrText);
    
    // Buat PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set header untuk download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="surat-peminjaman-${peminjamanId}.pdf"`);
    
    doc.pipe(res);
    
    // Header Surat
    doc.fontSize(20).font('Helvetica-Bold').text('SURAT PEMINJAMAN DEVICE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Nomor: ${peminjamanId}`, { align: 'center' });
    doc.moveDown(1);
    
    // Garis pemisah
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);
    
    // Informasi Peminjaman
    doc.fontSize(12);
    doc.text(`Nama Peminjam    : ${peminjaman.borrower_name}`);
    doc.text(`Device              : ${peminjaman.device_name} (${peminjaman.device_type})`);
    doc.text(`Tanggal Pinjam   : ${peminjaman.borrow_date}`);
    doc.text(`Keterangan         : ${peminjaman.return_info || '-'}`);
    doc.text(`Tanggal Cetak    : ${new Date().toLocaleDateString('id-ID')}`);
    doc.moveDown(1.5);
    
    // QR Code Section
    const currentY = doc.y;
    
    // Text tanda tangan di sebelah kiri
    doc.fontSize(10).text('Tanda Tangan Peminjam:', 50, currentY + 50);
    doc.moveDown(3);
    doc.text('_________________________');
    doc.text('(Nama Terang)');
    
    // QR Code di sebelah kanan
    try {
      const imageBase64 = qrCodeDataUrl.split(",")[1];
      const qrBuffer = Buffer.from(imageBase64, "base64");
      
      doc.image(qrBuffer, 350, currentY, { 
        width: 100,
        height: 100
      });
      
      doc.fontSize(8).text('QR Code Verifikasi', 350, currentY + 105, {
        width: 100,
        align: 'center'
      });
      
      // Tampilkan link verifikasi di bawah QR Code
      doc.fontSize(6).text(`Scan untuk verifikasi:`, 350, currentY + 120, {
        width: 100,
        align: 'center'
      });
      
    } catch (e) {
      console.warn("Gagal render QR code:", e);
      doc.fontSize(8).text('QR Code tidak dapat ditampilkan', 350, currentY + 60);
    }
    
    // Footer
    doc.y = 700;
    doc.fontSize(8).text('Dokumen ini dicetak secara elektronik dan berlaku tanpa tanda tangan basah.', { 
      align: 'center',
      width: 500
    });
    
    doc.end();
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Terjadi kesalahan saat generating PDF');
  }
});

// VERIFIKASI PEMINJAMAN MELALUI QR CODE (TANPA LOGIN)
app.get('/peminjaman/verify/:id', async (req, res) => {
  try {
    const peminjamanId = req.params.id;
    const peminjamanDoc = await db.collection("borrowings").doc(peminjamanId).get();
    
    if (!peminjamanDoc.exists) {
      return res.status(404).render('verification', { 
        valid: false,
        message: 'Data peminjaman tidak ditemukan'
      });
    }
    
    const peminjaman = peminjamanDoc.data();
    
    res.render('verification', {
      valid: true,
      peminjaman: {
        id: peminjamanId,
        ...peminjaman
      }
    });
    
  } catch (error) {
    console.error('Error verification:', error);
    res.status(500).render('verification', {
      valid: false,
      message: 'Terjadi kesalahan saat verifikasi'
    });
  }
});

// STORE LOANS DENGAN QR CODE (FITUR LAMA - UNTUK KOMPATIBILITAS)
app.post("/peminjaman/store-with-qr", requireLogin, async (req, res) => {
  try {
    const { device_id, borrower_name, borrow_date, return_info } = req.body;
    if (!device_id || !borrower_name) return res.status(400).send("Device & Nama Peminjam wajib diisi");

    const tempId = db.collection("loans").doc().id;
    const suratUrl = `http://localhost:${PORT}/peminjaman/surat/${tempId}`;
    const qrImage = await QRCode.toDataURL(suratUrl);

    const toSave = clean({
      device_id,
      borrower_name,
      borrow_date: borrow_date || (new Date()).toLocaleString(),
      return_info: return_info || "",
      qr_code: qrImage,
      created_at: new Date()
    });

    await db.collection("loans").doc(tempId).set(toSave);
    res.redirect(`/peminjaman/surat/${tempId}`);
  } catch (err) {
    console.error("Error storing loan:", err);
    res.status(500).send("Error: " + err);
  }
});

// SURAT PEMINJAMAN DENGAN QR (FITUR LAMA)
app.get("/peminjaman/surat/:id", async (req, res) => {
  try {
    const loanDoc = await db.collection("loans").doc(req.params.id).get();
    if (!loanDoc.exists) return res.status(404).send("Data tidak ditemukan");
    const loan = loanDoc.data();

    const deviceDoc = await db.collection("devices").doc(loan.device_id).get();
    const device = deviceDoc.exists ? deviceDoc.data() : { name: "-", type: "-" };

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=surat_${req.params.id}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).text("SURAT PEMINJAMAN DEVICE", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Nama Peminjam : ${loan.borrower_name}`);
    doc.text(`Device         : ${device.name || "-"} (${device.type || "-"})`);
    if (loan.borrow_date) doc.text(`Tanggal Pinjam : ${loan.borrow_date}`);
    if (loan.return_info) doc.text(`Keterangan     : ${loan.return_info}`);
    doc.moveDown();

    if (loan.qr_code) {
      try {
        const imageBase64 = loan.qr_code.split(",")[1];
        const qrBuffer = Buffer.from(imageBase64, "base64");
        doc.image(qrBuffer, { fit: [120, 120], align: "left" });
      } catch (e) {
        console.warn("Gagal render QR pada PDF:", e);
      }
    }

    doc.end();
  } catch (err) {
    console.error("Error generating surat:", err);
    res.status(500).send("Error: " + err);
  }
});

// ROUTE PENGEMBALIAN DEVICE
app.get("/returnBorrow/:id", requireLogin, async (req, res) => {
  try {
    const borrowId = req.params.id;
    
    console.log("Mengembalikan device dengan ID:", borrowId);
    
    // Update status pengembalian di borrowings
    await db.collection("borrowings").doc(borrowId).update({
      returnedAt: new Date(),
      status: "returned"
    });
    
    // Cari data borrowings yang sesuai
    const borrowDoc = await db.collection("borrowings").doc(borrowId).get();
    
    if (!borrowDoc.exists) {
      return res.status(404).send("Data peminjaman tidak ditemukan");
    }
    
    const borrowData = borrowDoc.data();
    
    // Update data yang sesuai di loans untuk konsistensi
    const loansSnapshot = await db.collection("loans")
      .where("deviceId", "==", borrowData.device_id)
      .where("borrower", "==", borrowData.borrower_name)
      .where("returnedAt", "==", null)
      .get();
    
    if (!loansSnapshot.empty) {
      for (const loanDoc of loansSnapshot.docs) {
        await db.collection("loans").doc(loanDoc.id).update({
          returnedAt: new Date()
        });
      }
    }
    
    res.redirect("/?message=Device berhasil dikembalikan");
  } catch (err) {
    console.error("Error returning device:", err);
    res.status(500).send("Gagal mengembalikan device: " + err);
  }
});

// Delete endpoints
app.get("/deleteBorrow/:id", requireLogin, async (req, res) => {
  try {
    await db.collection("borrowings").doc(req.params.id).delete();
    res.redirect("/");
  } catch (err) { 
    res.status(500).send("Gagal hapus: " + err); 
  }
});

app.get("/deleteLoan/:id", requireLogin, async (req, res) => {
  try {
    await db.collection("loans").doc(req.params.id).delete();
    res.redirect("/");
  } catch (err) { res.status(500).send("Gagal hapus: " + err); }
});

// CRUD devices
app.get("/add", requireLogin, (req, res) => res.render("add"));
app.post("/add", requireLogin, upload.fields([{ name: "photo", maxCount: 1 }, { name: "qrcode", maxCount: 1 }]), async (req, res, next) => {
  try {
    const name = req.body?.name?.trim();
    const type = req.body?.type?.trim();
    if (!name || !type) return res.status(400).send("Nama dan tipe device wajib diisi");

    const photo = req.files?.photo ? "/uploads/" + req.files.photo[0].filename : null;
    const qrcode = req.files?.qrcode ? "/uploads/" + req.files.qrcode[0].filename : null;

    const toSave = clean({ name, type, photo, qrcode });
    await db.collection("devices").add(toSave);
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// Edit device
app.get('/edit/:id', requireLogin, async (req, res) => {
  try {
    const deviceId = req.params.id;
    const deviceDoc = await db.collection('devices').doc(deviceId).get();

    if (!deviceDoc.exists) {
      return res.status(404).send('Device tidak ditemukan');
    }

    const device = { id: deviceDoc.id, ...deviceDoc.data() };
    res.render('edit', { device });
  } catch (err) {
    console.error("Error saat load edit:", err);
    res.status(500).send("Terjadi kesalahan saat memuat data edit");
  }
});

app.post('/edit/:id', requireLogin, async (req, res) => {
  try {
    const deviceId = req.params.id;
    const { name, type } = req.body;

    await db.collection('devices').doc(deviceId).update({ name, type });
    res.redirect('/');
  } catch (err) {
    console.error("Error saat update:", err);
    res.status(500).send("Terjadi kesalahan saat update data");
  }
});

// Peminjaman lama (compatibility)
app.get("/borrow/:id", requireLogin, async (req, res, next) => {
  try {
    const doc = await db.collection("devices").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).send("Device tidak ditemukan");
    res.render("borrowForm", { device: { id: doc.id, ...doc.data() } });
  } catch (err) { next(err); }
});

app.post("/borrow/:id", requireLogin, async (req, res, next) => {
  try {
    const deviceId = req.params.id;
    const borrower = req.body?.borrower?.trim();
    const location = req.body?.location?.trim();
    if (!borrower || !location) return res.status(400).send("Borrower & location wajib");

    const doc = await db.collection("devices").doc(deviceId).get();
    if (!doc.exists) return res.status(404).send("Device tidak ditemukan");

    await db.collection("borrowings").add({
      deviceId: doc.id,
      deviceName: doc.data().name,
      type: doc.data().type,
      photo: doc.data().photo || null,
      qrcode: doc.data().qrcode || null,
      borrowedAt: new Date(),
      returnedAt: null,
      borrower,
      location,
    });

    res.redirect("/");
  } catch (err) { next(err); }
});

// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));