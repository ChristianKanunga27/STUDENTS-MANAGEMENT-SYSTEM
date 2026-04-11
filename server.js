// ===============================
// IMPORTS
// ===============================
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const axios = require("axios");
const session = require("express-session");
const path = require("path");

const supabase = require("./supabase");

const app = express();

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

app.use(express.json());

// STATIC FILES
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: process.env.SESSION_SECRET || "super_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: "lax"
    }
}));

// ===============================
// AUTH MIDDLEWARE
// ===============================
function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    next();
}

// ===============================
// PAGE ROUTES
// ===============================
app.get("/", (req, res) => {
    res.send("<h1>SERVER IS WORKING 🎉</h1>");
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "public/register.html"));
});

app.get("/dashboard-page", (req, res) => {
    res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

// ===============================
// REGISTER (LOCAL USER)
// ===============================
app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const { data: existingUser } = await supabase
            .from("student")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashpassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from("student")
            .insert([{
                username,
                email,
                password: hashpassword,
                provider: "local"
            }])
            .select();

        if (error) throw error;

        res.json({ message: "Registration successful", user: data });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// LOGIN (LOCAL USER)
// ===============================
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        const { data: student } = await supabase
            .from("student")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        if (!student) {
            return res.status(400).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, student.password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password" });
        }

        req.session.user = {
            id: student.id,
            username: student.username,
            email: student.email
        };

        res.json({ message: "Login successful", user: req.session.user });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// GOOGLE OAUTH
// ===============================
app.get("/auth/google", (req, res) => {
    const url =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_REDIRECT}&response_type=code&scope=email profile`;

    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        const code = req.query.code;

        const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: process.env.GOOGLE_REDIRECT
        });

        const access_token = tokenRes.data.access_token;

        const userRes = await axios.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            { headers: { Authorization: `Bearer ${access_token}` } }
        );

        const user = userRes.data;

        await supabase.from("student").upsert([{
            email: user.email,
            username: user.name,
            provider: "google"
        }], { onConflict: "email" });

        req.session.user = {
            email: user.email,
            username: user.name
        };

        res.redirect("/dashboard-page");

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Google OAuth failed" });
    }
});

// ===============================
// GITHUB OAUTH
// ===============================
app.get("/auth/github", (req, res) => {
    const url =
        `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email`;

    res.redirect(url);
});

app.get("/auth/github/callback", async (req, res) => {
    try {
        const code = req.query.code;

        const tokenRes = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code
            },
            { headers: { Accept: "application/json" } }
        );

        const access_token = tokenRes.data.access_token;

        const userRes = await axios.get("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const emailRes = await axios.get("https://api.github.com/user/emails", {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const primaryEmail = emailRes.data.find(e => e.primary)?.email;

        const user = userRes.data;

        await supabase.from("student").upsert([{
            email: primaryEmail || `${user.login}@github.com`,
            username: user.login,
            provider: "github"
        }], { onConflict: "email" });

        req.session.user = {
            email: primaryEmail,
            username: user.login
        };

        res.redirect("/dashboard-page");

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "GitHub OAuth failed" });
    }
});

// ===============================
// DASHBOARD API (PROTECTED)
// ===============================
app.get("/dashboard", isAuthenticated, (req, res) => {
    res.json({
        message: "Welcome to dashboard",
        user: req.session.user
    });
});

// ===============================
// LOGOUT
// ===============================
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});