require("dotenv").config({ path: "../.env" });

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const supabase = require("../supabase");
const sendEmail = require("./mailer");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ===============================
   FORGOT PASSWORD
================================ */
app.post("/forgot", async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Check user
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2. Create reset token
        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiry = Date.now() + 3600000; // 1 hour

        // 3. Save token in Supabase
        await supabase
            .from("users")
            .update({
                reset_token: resetToken,
                reset_token_expiry: expiry
            })
            .eq("email", email);

        // 4. Reset link
        const resetLink = `http://localhost:3000/reset.html?token=${resetToken}`;

        // 5. Send email
        await sendEmail(
            email,
            "Reset Your Password",
            `
                <h2>Password Reset Request</h2>
                <p>Click below to reset your password:</p>
                <a href="${resetLink}">Reset Password</a>
                <p>This link expires in 1 hour.</p>
            `
        );

        res.json({ message: "Reset email sent successfully" });

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

    try {
        // 1. Find user by token
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("reset_token", token)
            .single();

        if (error || !user) {
            return res.status(400).json({ message: "Invalid token" });
        }

        // 2. Check expiry
        if (user.reset_token_expiry < Date.now()) {
            return res.status(400).json({ message: "Token expired" });
        }

        // 3. Hash password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 4. Update password & clear token
        await supabase
            .from("users")
            .update({
                password: hashedPassword,
                reset_token: null,
                reset_token_expiry: null
            })
            .eq("email", user.email);

        res.json({ message: "Password reset successful" });

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