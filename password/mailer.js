// mailer.js

const nodemailer = require("nodemailer");
require("dotenv").config();

// 1. Create transporter (email service config)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL,       // your Gmail address
        pass: process.env.EMAIL_PASS   // Gmail App Password
    }
});

// 2. Function to send email
const sendEmail = async (to, subject, htmlContent) => {
    try {
        const mailOptions = {
            from: `"STUDENT MANAGEMENT SYSTEM" <${process.env.EMAIL}>`,
            to: to,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);

        return info;
    } catch (error) {
        console.log("Email error:", error);
        throw error;
    }
};

module.exports = sendEmail;