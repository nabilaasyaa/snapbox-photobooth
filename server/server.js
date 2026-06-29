/**
 * SNAPBOX — Backend kecil untuk mengirim email lewat Resend.
 *
 * PENTING: sama seperti SendGrid, Resend juga TIDAK BISA dipanggil langsung
 * dari browser/JavaScript sisi klien dengan aman — API key harus disimpan di
 * server, bukan di kode yang bisa dibaca lewat DevTools browser. Server kecil
 * ini menjadi perantara antara halaman web dan Resend.
 *
 * Cara pakai:
 *   1. npm install
 *   2. Salin .env.example menjadi .env, isi RESEND_API_KEY dan SENDER_EMAIL
 *   3. npm start
 *   4. Server jalan di http://localhost:4000
 *   5. Di app.js (folder utama project), isi API_BASE_URL dengan alamat
 *      server ini (lihat README.md bagian "Mengaktifkan kirim email via Resend")
 *
 * Catatan: endpoint (/api/send-photo-email) dan bentuk request/response-nya
 * dibuat identik dengan versi SendGrid sebelumnya, supaya app.js di frontend
 * tidak perlu diubah sama sekali — cukup backend ini yang beda provider.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 4000;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL; // email pengirim — pakai onboarding@resend.dev untuk testing, atau domain sendiri yang sudah diverifikasi

let resend = null;
if (!RESEND_API_KEY || !SENDER_EMAIL) {
  console.warn(
    "⚠️  RESEND_API_KEY atau SENDER_EMAIL belum diisi di file .env — " +
    "server akan jalan tapi pengiriman email akan gagal sampai diisi."
  );
} else {
  resend = new Resend(RESEND_API_KEY);
}

app.use(cors());                         // izinkan dipanggil dari halaman web manapun (atasi via origin spesifik di produksi, lihat catatan di README)
app.use(express.json({ limit: "2mb" })); // foto dikirim sebagai data URL, jadi body bisa cukup besar

app.get("/", (req, res) => {
  res.send("Snapbox email backend (Resend) aktif. Gunakan POST /api/send-photo-email.");
});

app.post("/api/send-photo-email", async (req, res) => {
  const { toEmail, brandName, orderCode, photoDataUrl } = req.body || {};

  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return res.status(400).json({ ok: false, error: "Alamat email tujuan tidak valid." });
  }
  if (!resend) {
    return res.status(500).json({ ok: false, error: "Server belum dikonfigurasi (RESEND_API_KEY/SENDER_EMAIL kosong)." });
  }

  const safeBrand = (brandName || "SNAPBOX").toString().slice(0, 60);
  const safeOrder = (orderCode || "-").toString().slice(0, 40);

  const attachments = photoDataUrl
    ? [
        {
          filename: `${safeBrand.replace(/\s+/g, "_")}_${safeOrder}.jpg`,
          content: photoDataUrl.split(",")[1], // buang prefix "data:image/jpeg;base64,", sisakan base64 murni
        },
      ]
    : [];

  try {
    const { data, error } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: [toEmail],
      subject: `Foto kamu dari ${safeBrand} sudah siap!`,
      text:
        `Halo!\n\nTerima kasih sudah memakai ${safeBrand}.\n` +
        `Kode pesananmu: ${safeOrder}\n\n` +
        `Foto hasil sesi photobooth-mu terlampir di email ini.\n\n` +
        `Sampai jumpa lagi!`,
      html:
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">` +
        `<h2 style="margin-bottom:4px;">${safeBrand}</h2>` +
        `<p style="color:#555;">Kode pesanan: <strong>${safeOrder}</strong></p>` +
        `<p>Terima kasih sudah memakai layanan photobooth kami. Foto hasil sesi kamu ada di lampiran email ini.</p>` +
        `</div>`,
      attachments,
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ ok: false, error: "Gagal mengirim email lewat Resend." });
    }

    res.json({ ok: true, id: data && data.id });
  } catch (err) {
    console.error("Resend error:", err.message || err);
    res.status(500).json({ ok: false, error: "Gagal mengirim email lewat Resend." });
  }
});

app.listen(PORT, () => {
  console.log(`Snapbox email backend (Resend) jalan di http://localhost:${PORT}`);
});
