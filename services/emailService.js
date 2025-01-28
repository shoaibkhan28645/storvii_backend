const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

class EmailService {
  static generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static async sendVerificationEmail(email, code) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Verification for Storvii",
      html: `<p>Your verification code is: <strong>${code}</strong></p>`,
    };

    return await transporter.sendMail(mailOptions);
  }
}

module.exports = EmailService;
