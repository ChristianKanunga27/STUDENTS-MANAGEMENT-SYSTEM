require("dotenv").config({ path: "../.env" });

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const supabase = require("../supabase");
const sendEmail = require("./mailer");

const app = express();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

function normalizeEmail(email = "") {
    return email.trim().toLowerCase();
}

function buildResetLink(req, token) {
    const appUrl = process.env.APP_URL
        ? process.env.APP_URL.replace(/\/$/, "")
        : `${req.protocol}://${req.get("host")}`;

    return `${appUrl}/password/reset.html?token=${token}`;
}

function getResetExpiryTimestamp(value) {
    if (!value) return null;
    if (typeof value === "number") return value;

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
}

/* ===============================
   FORGOT PASSWORD
================================ */
app.post("/forgot", async (req, res) => {
    const email = normalizeEmail(req.body.email);

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    try {
        const { data: user, error } = await supabase
            .from("student")
            .select("id, email, username")
            .eq("email", email)
            .maybeSingle();

        if (error) throw error;
        if (!user) return res.status(404).json({ message: "Email does not exist in the database" });

        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedResetToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");
        const expiry = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

        const { error: updateError } = await supabase
            .from("student")
            .update({
                reset_token: hashedResetToken,
                reset_token_expiry: expiry
            })
            .eq("id", user.id);

        if (updateError) throw updateError;

        const resetLink = buildResetLink(req, resetToken);

        try {
            await sendEmail(
                email,
                "Reset Your Password",
                `
                    <h2>Password Reset Request</h2>
                    <p>Hello ${user.username || "there"},</p>
                    <p>Click the link below to reset your password:</p>
                    <a href="${resetLink}">Reset Password</a>
                    <p>This link expires in one hour.</p>
                `
            );
        } catch (emailError) {
            console.log("EMAIL SEND ERROR:", emailError);
            await supabase
                .from("student")
                .update({
                    reset_token: null,
                    reset_token_expiry: null
                })
                .eq("id", user.id);

            return res.status(500).json({ message: "Reset email could not be sent. Please try again." });
        }

        res.json({ success: true, message: "Reset email sent successfully" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});


/* ===============================
   RESET PASSWORD
================================ */
app.post("/reset", async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
        const hashedResetToken = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const { data: user, error } = await supabase
            .from("student")
            .select("id, email, reset_token_expiry")
            .eq("reset_token", hashedResetToken)
            .maybeSingle();

        if (error) throw error;
        if (!user) return res.status(400).json({ message: "Invalid token" });

        const expiryTimestamp = getResetExpiryTimestamp(user.reset_token_expiry);
        if (!expiryTimestamp || expiryTimestamp < Date.now()) {
            return res.status(400).json({ message: "Token expired" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const { error: updateError } = await supabase
            .from("student")
            .update({
                password: hashedPassword,
                reset_token: null,
                reset_token_expiry: null
            })
            .eq("id", user.id);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Password reset successful" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});


/* ===============================
   SERVER START
================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
