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
// TRUST PROXY
// ===============================
app.set("trust proxy", 1);

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors({
    origin: true, // allow any frontend development
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/password", express.static("password"));

// ===============================
// SESSION CONFIG
// ===============================
app.use(session({
    name: "session_id",
    secret: process.env.SESSION_SECRET || "super_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // change to true in production (HTTPS)
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ===============================
// AUTH MIDDLEWARE
// ===============================
function isAuthenticated(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

function isAdmin(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    if (req.session.user.role !== "admin") {
        return res.status(403).send("Access denied");
    }
    next();
}

// ===============================
// PAGES
// ===============================
app.get("/", (req, res) => res.send("SERVER RUNNING"));

app.get("/login", (req, res) =>
    res.sendFile(path.join(__dirname, "public/login.html"))
);

app.get("/register", (req, res) =>
    res.sendFile(path.join(__dirname, "public/register.html"))
);

app.get("/dashboard-page", isAuthenticated, (req, res) =>
    res.sendFile(path.join(__dirname, "public/dashboard.html"))
);

app.get("/admin-page", isAdmin, (req, res) =>
    res.sendFile(path.join(__dirname, "public/admin.html"))
);

// ===============================
// REGISTER
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

        const { data: existingUser, error: checkError } = await supabase
            .from("student")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hash = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from("student")
            .insert([{
                username,
                email,
                password: hash,
                provider: "local",
                role: "user"
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({ message: "Registered successfully" });

    } catch (err) {
        console.error("REGISTER ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// LOGIN
// ===============================
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const { data, error } = await supabase
            .from("student")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        if (error || !data) {
            return res.status(400).json({ message: "User not found" });
        }

        const valid = await bcrypt.compare(password, data.password);

        if (!valid) {
            return res.status(400).json({ message: "Wrong password" });
        }

        req.session.user = {
            id: data.id,
            username: data.username,
            email: data.email,
            role: data.role || "user"
        };

        req.session.save(() => {
            return res.json({
                redirect: data.role === "admin"
                    ? "/admin-page"
                    : "/dashboard-page"
            });
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// GOOGLE LOGIN
// ===============================
app.get("/auth/google", (req, res) => {
    const url =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_REDIRECT}&response_type=code&scope=email profile`;

    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        const code = req.query.code;

        const tokenRes = await axios.post(
            "https://oauth2.googleapis.com/token",
            new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: process.env.GOOGLE_REDIRECT
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const access_token = tokenRes.data.access_token;

        const userRes = await axios.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            { headers: { Authorization: `Bearer ${access_token}` } }
        );

        const user = userRes.data;

        const { data: existingUser } = await supabase
            .from("student")
            .select("*")
            .eq("email", user.email)
            .maybeSingle();

        const role = existingUser?.role || "user";

        const { data, error } = await supabase
            .from("student")
            .upsert([{
                email: user.email,
                username: user.name,
                provider: "google",
                role: role
            }], { onConflict: "email" })
            .select()
            .single();

        if (error) throw error;

        req.session.user = {
            id: data.id,
            email: data.email,
            username: data.username,
            role: data.role
        };

        req.session.save(() => {
            return res.redirect(
                data.role === "admin"
                    ? "/admin-page"
                    : "/dashboard-page"
            );
        });

    } catch (err) {
        console.error("GOOGLE ERROR:", err);
        res.redirect("/login");
    }
});

// ===============================
// GITHUB LOGIN
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
        const email = primaryEmail || `${userRes.data.login}@github.com`;

        const { data: existingUser } = await supabase
            .from("student")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        const role = existingUser?.role || "user";

        const { data, error } = await supabase
            .from("student")
            .upsert([{
                email,
                username: userRes.data.login,
                provider: "github",
                role
            }], { onConflict: "email" })
            .select()
            .single();

        if (error) throw error;

        req.session.user = {
            id: data.id,
            email: data.email,
            username: data.username,
            role: data.role
        };

        req.session.save(() => {
            return res.redirect(
                data.role === "admin"
                    ? "/admin-page"
                    : "/dashboard-page"
            );
        });

    } catch (err) {
        console.error("GITHUB ERROR:", err);
        res.redirect("/login");
    }
});

// ===============================
// DASHBOARD API
// ===============================
app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Not logged in" });
    }
    res.json(req.session.user);
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
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});