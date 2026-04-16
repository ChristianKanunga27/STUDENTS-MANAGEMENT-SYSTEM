// mailer.js

const nodemailer = require("nodemailer");
require("dotenv").config();

function getMailCredentials() {
    return {
        user: (process.env.EMAIL || "").trim(),
        // Gmail app passwords are often copied with spaces; strip them safely.
        pass: (process.env.EMAIL_PASS || "").replace(/\s+/g, "")
    };
}

function createTransporter() {
    const credentials = getMailCredentials();

    return nodemailer.createTransport({
        service: "gmail",
        auth: credentials
    });
}

// 2. Function to send email
const sendEmail = async (to, subject, htmlContent) => {
    try {
        const credentials = getMailCredentials();

        if (!credentials.user || !credentials.pass) {
            throw new Error("Missing EMAIL or EMAIL_PASS in environment");
        }

        const transporter = createTransporter();

        const mailOptions = {
            from: `"STUDENT MANAGEMENT SYSTEM" <${credentials.user}>`,
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
