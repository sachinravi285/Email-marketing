import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import StudentEmailLog from "./models/StudentEmailLog.js";
import ClientEmailLog from "./models/ClientEmailLog.js";
import Unsub from "./models/Unsub.js";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Server Configs
const SERVER_URL = "http://localhost:5000";
const PORT = 5000;
const MONGODB_URI = "mongodb://127.0.0.1:27017/emailAnalytics";

// ✅ Company Email SMTP Configs
const companyConfigs = {
  TrainingTrains: {
    email: "",
    password: "",
    host: "",
  },
  Domainhostly: {
    email: "",
    password: "",
    host: "",
  },
  W3AppDevelopers: {
    email: "",
    password: "",
    host: "",
  },
};

// ✅ MongoDB Connection
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ✅ Link Tracker
function wrapLinksForTracking(body = "", recipientEmail) {
  return body.replace(/href="(.*?)"/g, (match, url) => {
    const trackedUrl = `${SERVER_URL}/click?email=${encodeURIComponent(
      recipientEmail
    )}&url=${encodeURIComponent(url)}`;
    return `href="${trackedUrl}"`;
  });
}

// ✅ SMTP Mail Transporter
function createTransporter(company) {
  const { email, password, host } = companyConfigs[company];

  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false },
  });
}

// ✅ Send Individual Email
async function sendSingleEmail(transporter, recipient, subject, body, company, EmailModel) {
  if (!recipient?.email) return false;

  const wrappedBody = wrapLinksForTracking(body || "<p>No content</p>", recipient.email);

  await transporter.sendMail({
    from: `"${company}" <${transporter.options.auth.user}>`,
    to: recipient.email,
    subject: subject || "No Subject",
    html: wrappedBody,
  });

  await EmailModel.create({
    email: recipient.email,
    subject,
    company,
    sentAt: new Date(),
  });

  console.log(`✅ Email sent & logged: ${recipient.email}`);
  return true;
}

// ✅ Email Sending API
app.post("/api/sendEmails", async (req, res) => {
  try {
    const { company, emailSubject, recipients, audienceType } = req.body;

    if (!companyConfigs[company]) {
      return res.status(400).json({ message: "Invalid company" });
    }

    const unsubList = await Unsub.find().lean();
    const unsubEmails = new Set(unsubList.map((u) => u.email));

    const transporter = createTransporter(company);
    const EmailModel = audienceType === "client" ? ClientEmailLog : StudentEmailLog;

    const validRecipients = recipients.filter((r) => !unsubEmails.has(r.email));
    if (validRecipients.length === 0) {
      return res.json({ message: "No valid recipients (all unsubscribed?)" });
    }

    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES = 2000;
    let sentCount = 0;

    for (let i = 0; i < validRecipients.length; i += BATCH_SIZE) {
      const batch = validRecipients.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map((recipient) =>
          sendSingleEmail(
            transporter,
            recipient,
            emailSubject,
            recipient.body,
            company,
            EmailModel
          ).catch((err) => {
            console.error(`❌ Failed for ${recipient.email}:`, err.message);
            return false;
          })
        )
      );

      sentCount += results.filter(Boolean).length;
      console.log(`📤 Batch ${Math.floor(i / BATCH_SIZE) + 1} sent (${sentCount}/${validRecipients.length})`);

      if (i + BATCH_SIZE < validRecipients.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    res.json({
      message: `✅ Sent ${sentCount}/${validRecipients.length} emails for ${company} (${audienceType})`,
    });
  } catch (err) {
    console.error("❌ Send Email Error:", err.message);
    res.status(500).json({ message: `Server Error: ${err.message}` });
  }
});

// ✅ Unsubscribe Endpoint
app.get("/unsubscribe", async (req, res) => {
  const email = decodeURIComponent(req.query.email || "");
  if (!email) return res.status(400).send("Invalid unsubscribe request");

  try {
    const exists = await Unsub.findOne({ email });
    if (!exists) await Unsub.create({ email });

    res.send(`
      <html>
        <body style="font-family: Arial; text-align:center; padding:50px;">
          <h2>You have been unsubscribed successfully!</h2>
          <p>${email}</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Unsubscribe Error:", err.message);
    res.status(500).send("Server error");
  }
});

// ✅ Click Tracking
app.get("/click", async (req, res) => {
  const email = decodeURIComponent(req.query.email || "");
  const redirectUrl = decodeURIComponent(req.query.url || "");

  try {
    if (email && redirectUrl) {
      await StudentEmailLog.updateOne(
        { email },
        { $push: { clickedLinks: { url: redirectUrl, clickedAt: new Date() } } },
        { upsert: true }
      );
      await ClientEmailLog.updateOne(
        { email },
        { $push: { clickedLinks: { url: redirectUrl, clickedAt: new Date() } } },
        { upsert: true }
      );
      console.log(`🔗 Click tracked: ${email} → ${redirectUrl}`);
    }

    res.redirect(redirectUrl || "https://google.com");
  } catch (err) {
    console.error("❌ Click tracking error:", err.message);
    res.redirect("https://google.com");
  }
});

// ✅ Basic Email Stats
app.get("/api/stats", async (req, res) => {
  try {
    const studentSent = await StudentEmailLog.countDocuments();
    const clientSent = await ClientEmailLog.countDocuments();
    const unsubCount = await Unsub.countDocuments();

    res.json({
      totalStudentSent: studentSent,
      totalClientSent: clientSent,
      totalAllSent: studentSent + clientSent,
      unsubCount,
    });
  } catch (err) {
    console.error("❌ Stats Error:", err.message);
    res.status(500).json({ message: "Error fetching stats" });
  }
});

// ✅ Detailed Email Stats
app.get("/api/stats/details", async (req, res) => {
  try {
    const students = await StudentEmailLog.find().lean();
    const clients = await ClientEmailLog.find().lean();
    const unsubscribed = await Unsub.find().lean();

    res.json({ students, clients, unsubscribed });
  } catch (err) {
    console.error("❌ Detailed stats error:", err.message);
    res.status(500).json({ message: "Server error while fetching details" });
  }
});

// ✅ Start Server
app.listen(PORT, () =>
  console.log(`✅ Backend running on ${SERVER_URL}`)
);
