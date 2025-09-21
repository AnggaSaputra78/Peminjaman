// server.js
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import QRCode from "qrcode";
import db from "./firebase.js";

const app = express();
const PORT = 3000;

// -------------------------------
// Upload directory (pastikan ada)
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log("Membuat folder:", UPLOAD_DIR);
}

// -------------------------------
// Multer config (max 20 MB)
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || "";
    cb(null, Date.now() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Hanya file gambar yang diizinkan"), false);
    }
    cb(null, true);
  },
});

// -------------------------------
// Middleware & view engine
app.set("view engine", "ejs");
app.use("/uploads", express.static(UPLOAD_DIR)); // akses foto via /uploads/...
app.use(express.urlencoded({ extended: true }));

// Helper: safe timestamp -> Date
function toDateSafe(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  return new Date(val);
}

// -------------------------------
// Halaman utama (generate QR untuk setiap device)
app.get("/", async (req, res) => {
  try {
    // ambil devices
    const snapshotDevices = await db.collection("devices").get();
    const devicesRaw = snapshotDevices.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // generate QR untuk tiap device (dataURL)
    const devices = await Promise.all(devicesRaw.map(async d => {
      try {
        // gunakan string id sebagai payload QR
        const qrDataUrl = await QRCode.toDataURL(String(d.id));
        return { ...d, qr: qrDataUrl };
      } catch (err) {
        console.error("Gagal generate QR untuk", d.id, err);
        return { ...d, qr: null };
      }
    }));

    // ambil borrowings
    const snapshotBorrowings = await db
      .collection("borrowings")
      .orderBy("borrowedAt", "desc")
      .get();

    const borrowings = snapshotBorrowings.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        borrowedAt: toDateSafe(data.borrowedAt),
        returnedAt: toDateSafe(data.returnedAt),
      };
    });

    res.render("index", { devices, borrowings });
  } catch (err) {
    console.error("Gagal render halaman utama:", err);
    res.status(500).send("Server error");
  }
});

// -------------------------------
// -------------------------------
// Tambah device (form + upload)
app.get("/add", (req, res) => res.render("add"));

// Gunakan fields untuk menerima 2 file (photo + qrcode)
app.post("/add", upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "qrcode", maxCount: 1 }
]), async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const type = req.body?.type?.trim();
    if (!name || !type) return res.status(400).send("Nama dan tipe device wajib diisi");

    const photo = req.files?.photo ? "/uploads/" + req.files.photo[0].filename : null;
    const qrcode = req.files?.qrcode ? "/uploads/" + req.files.qrcode[0].filename : null;

    await db.collection("devices").add({ name, type, photo, qrcode });
    res.redirect("/");
  } catch (err) {
    console.error("Gagal tambah device:", err);
    res.status(500).send("Gagal menambahkan device");
  }
});

// -------------------------------
// Edit device
app.get("/edit/:id", async (req, res) => {
  try {
    const doc = await db.collection("devices").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).send("Device tidak ditemukan");
    res.render("edit", { device: { id: doc.id, ...doc.data() } });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.post("/edit/:id", upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "qrcode", maxCount: 1 }
]), async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const type = req.body?.type?.trim();
    if (!name || !type) return res.status(400).send("Nama dan tipe device wajib diisi");

    const updateData = { name, type };
    if (req.files?.photo) updateData.photo = "/uploads/" + req.files.photo[0].filename;
    if (req.files?.qrcode) updateData.qrcode = "/uploads/" + req.files.qrcode[0].filename;

    await db.collection("devices").doc(req.params.id).update(updateData);
    res.redirect("/");
  } catch (err) {
    console.error("Gagal update device:", err);
    res.status(500).send("Gagal update device");
  }
});

app.post("/edit/:id", upload.single("photo"), async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const type = req.body?.type?.trim();
    if (!name || !type) return res.status(400).send("Nama dan tipe device wajib diisi");

    const updateData = { name, type };
    if (req.file) updateData.photo = "/uploads/" + req.file.filename;

    await db.collection("devices").doc(req.params.id).update(updateData);
    res.redirect("/");
  } catch (err) {
    console.error("Gagal update device:", err);
    res.status(500).send("Gagal update device");
  }
});

// -------------------------------
// Hapus device
app.get("/delete/:id", async (req, res) => {
  try {
    await db.collection("devices").doc(req.params.id).delete();
    res.redirect("/");
  } catch (err) {
    console.error("Gagal hapus device:", err);
    res.status(500).send("Gagal hapus device");
  }
});

// -------------------------------
// Form & proses peminjaman
app.get("/borrow/:id", async (req, res) => {
  try {
    const doc = await db.collection("devices").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).send("Device tidak ditemukan");
    res.render("borrowForm", { device: { id: doc.id, ...doc.data() } });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.post("/borrow/:id", async (req, res) => {
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
      borrowedAt: new Date(),
      returnedAt: null,
      borrower,
      location,
    });

    res.redirect("/");
  } catch (err) {
    console.error("Gagal meminjam device:", err);
    res.status(500).send("Gagal meminjam device");
  }
});

// -------------------------------
// Kembalikan / Hapus peminjaman
app.get("/return/:id", async (req, res) => {
  try {
    await db.collection("borrowings").doc(req.params.id).delete();
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Gagal kembalikan device");
  }
});

app.get("/deleteBorrow/:id", async (req, res) => {
  try {
    await db.collection("borrowings").doc(req.params.id).delete();
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Gagal hapus peminjaman");
  }
});

// -------------------------------
// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
