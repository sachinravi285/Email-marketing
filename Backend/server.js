import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Company email configurations
const companyConfigs = {
  TrainingTrains: {
    email: "",
    password: "", // ✅ Gmail App Password
  },
  W3AppDevelopers: {
    email: "companyB@gmail.com",
    password: "app-password", // Replace with actual App Password
  },
  Domainhostly: {
    email: "companyC@gmail.com",
    password: "app-password", // Replace with actual App Password
  },
};

// ✅ API to send emails
app.post("/api/sendEmails", async (req, res) => {
  const { company, emailSubject, emailBody, recipients } = req.body;

  // ✅ Validate request
  if (!companyConfigs[company]) {
    return res.status(400).json({ message: "❌ Invalid company selected!" });
  }
  if (!recipients || recipients.length === 0) {
    return res.status(400).json({ message: "❌ No recipients provided!" });
  }

  const { email, password } = companyConfigs[company];

  // ✅ Configure Nodemailer transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass: password },
  });

  let sentCount = 0;

  // ✅ Send emails one by one
  for (let recipient of recipients) {
    try {
      await transporter.sendMail({
        from: `"${company}" <${email}>`, // ✅ Display company name
        to: recipient.email,
        subject: emailSubject,
        html: emailBody,
      });

      console.log(`✅ Email sent to ${recipient.email}`);
      sentCount++;
    } catch (err) {
      console.error(`❌ Failed to send to ${recipient.email}:`, err.message);
    }
  }

  res.json({
    message: `✅ Sent ${sentCount}/${recipients.length} emails for ${company}`,
  });
});

// ✅ Start server
const PORT = 5000;
app.listen(PORT, () =>
  console.log(`✅ Backend running on http://localhost:${PORT}`)
);
