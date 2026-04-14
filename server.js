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
const crypto = require("crypto");
const supabase = require("./supabase");
const sendEmail = require("./password/mailer");

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

app.get("/dashboard-page", isAuthenticated, (req, res) => {
    if (req.session.user.role === "admin") {
        return res.redirect("/admin-page");
    }
    res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

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

        const { data: existingEmail, error: emailCheckError } = await supabase
            .from("student")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if (emailCheckError) throw emailCheckError;

        if (existingEmail) {
            return res.status(400).json({ message: "Email already registered" });
        }

        const { data: existingUsername, error: usernameCheckError } = await supabase
            .from("student")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        if (usernameCheckError) throw usernameCheckError;

        if (existingUsername) {
            return res.status(400).json({ message: "Username already taken" });
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

        const { data: userByUsername, error: usernameError } = await supabase
            .from("student")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        const { data: userByEmail, error: emailError } = await supabase
            .from("student")
            .select("*")
            .eq("email", username)
            .maybeSingle();

        if (usernameError || emailError) {
            throw usernameError || emailError;
        }

        const data = userByUsername || userByEmail;

        if (!data) {
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

        req.session.save((err) => {
            if (err) {
                console.error("SESSION SAVE ERROR:", err);
                return res.status(500).json({ message: "Session error" });
            }
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
// FORGOT PASSWORD
// ===============================
app.post("/forgot", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    try {
        const { data: user, error } = await supabase
            .from("student")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if (error) throw error;

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiry = Date.now() + 3600000;

        const { error: updateError } = await supabase
            .from("student")
            .update({
                reset_token: resetToken,
                reset_token_expiry: expiry
            })
            .eq("email", email);

        if (updateError) throw updateError;

        const resetLink = `${req.protocol}://${req.get("host")}/password/reset.html?token=${resetToken}`;

        try {
            await sendEmail(
                email,
                "Reset Your Password",
                `
                    <h2>Password Reset Request</h2>
                    <p>Click the link below to reset your password:</p>
                    <a href="${resetLink}">Reset Password</a>
                    <p>This link expires in one hour.</p>
                `
            );
        } catch (emailError) {
            console.error("EMAIL SEND ERROR:", emailError);
            // Still return success to prevent enumeration, but log the error
        }

        res.json({ message: "Reset email sent successfully" });
    } catch (err) {
        console.error("FORGOT PASSWORD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// RESET PASSWORD
// ===============================
app.post("/reset", async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
    }

    try {
        const { data: user, error } = await supabase
            .from("student")
            .select("*")
            .eq("reset_token", token)
            .maybeSingle();

        if (error) throw error;

        if (!user) {
            return res.status(400).json({ message: "Invalid token" });
        }

        if (!user.reset_token_expiry || user.reset_token_expiry < Date.now()) {
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
            .eq("email", user.email);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Password reset successful" });
    } catch (err) {
        console.error("RESET PASSWORD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// ADMIN ROLE MANAGEMENT
// ===============================
app.post("/admin/change-role", isAdmin, async (req, res) => {
    try {
        const { email, role } = req.body;

        if (!email || !role) {
            return res.status(400).json({ message: "Email and role are required" });
        }

        const allowedRoles = ["user", "admin"];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: "Role must be 'user' or 'admin'" });
        }

        const { data: user, error: userError } = await supabase
            .from("student")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if (userError) throw userError;
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const { error: updateError } = await supabase
            .from("student")
            .update({ role })
            .eq("email", email);

        if (updateError) throw updateError;

        res.json({ success: true, message: `Role updated to ${role} for ${email}` });
    } catch (err) {
        console.error("ROLE CHANGE ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// ADMIN STUDENT MANAGEMENT
// ===============================
app.get("/admin/students", isAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("student")
            .select("*");

        if (error) throw error;

        const students = data.map(user => {
            const { password, reset_token, reset_token_expiry, ...rest } = user;
            return rest;
        });

        res.json({ students });
    } catch (err) {
        console.error("GET STUDENTS ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/admin/students", isAdmin, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const allowedRoles = ["user", "admin"];

        if (!username || !email || !password) {
            return res.status(400).json({ message: "Username, email, and password are required." });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters." });
        }

        const { data: existing, error: existingError } = await supabase
            .from("student")
            .select("id")
            .eq("email", email)
            .maybeSingle();

        if (existingError) throw existingError;
        if (existing) {
            return res.status(409).json({ message: "A student with this email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase
            .from("student")
            .insert({
                username,
                email,
                password: hashedPassword,
                role: allowedRoles.includes(role) ? role : "user",
                provider: "manual"
            })
            .select()
            .single();

        if (error) throw error;

        const { password: _password, ...createdStudent } = data;
        res.status(201).json({ success: true, student: createdStudent, message: "Student created successfully." });
    } catch (err) {
        console.error("CREATE STUDENT ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.patch("/admin/students/:id", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { username, email, role } = req.body;

        if (!id || !username || !email || !role) {
            return res.status(400).json({ message: "Student id, username, email, and role are required" });
        }

        const allowedRoles = ["user", "admin"];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: "Role must be 'user' or 'admin'" });
        }

        const { error } = await supabase
            .from("student")
            .update({ username, email, role })
            .eq("id", id);

        if (error) throw error;

        res.json({ success: true, message: "Student updated successfully" });
    } catch (err) {
        console.error("UPDATE STUDENT ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/admin/students/:id/marks", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { subject, score, maxScore } = req.body;

        if (!id || !subject || score == null || maxScore == null) {
            return res.status(400).json({ message: "Student id, subject, score and maxScore are required" });
        }

        const { data: student, error: studentError } = await supabase
            .from("student")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (studentError) throw studentError;
        if (!student) {
            return res.status(404).json({ message: "Student not found" });
        }

        let marks = [];
        if (student.marks) {
            if (Array.isArray(student.marks)) {
                marks = student.marks;
            } else {
                try {
                    marks = JSON.parse(student.marks);
                    if (!Array.isArray(marks)) marks = [];
                } catch {
                    marks = [];
                }
            }
        }

        marks.push({
            subject,
            score,
            maxScore,
            date: new Date().toISOString()
        });

        const { error: updateError } = await supabase
            .from("student")
            .update({ marks })
            .eq("id", id);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Mark added successfully" });
    } catch (err) {
        console.error("ADD MARK ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Attendance and quiz management stored in-memory during runtime.
const attendanceRecords = [];
const quizItems = [];

function createRecordId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

app.get("/admin/attendance", isAdmin, async (req, res) => {
    res.json({ attendance: attendanceRecords });
});

app.post("/admin/attendance", isAdmin, async (req, res) => {
    try {
        const { name, date, status } = req.body;

        if (!name || !date || !status) {
            return res.status(400).json({ message: "Name, date, and status are required." });
        }

        const record = {
            id: createRecordId(),
            name,
            date,
            status,
            createdAt: new Date().toISOString()
        };

        attendanceRecords.unshift(record);
        res.status(201).json({ success: true, message: "Attendance recorded.", record });
    } catch (err) {
        console.error("CREATE ATTENDANCE ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.delete("/admin/attendance/:id", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const index = attendanceRecords.findIndex(record => record.id === id);

        if (index === -1) {
            return res.status(404).json({ message: "Attendance record not found." });
        }

        attendanceRecords.splice(index, 1);
        res.json({ success: true, message: "Attendance record removed." });
    } catch (err) {
        console.error("DELETE ATTENDANCE ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.get("/admin/quiz", isAdmin, async (req, res) => {
    res.json({ quiz: quizItems });
});

app.post("/admin/quiz", isAdmin, async (req, res) => {
    try {
        const { question, optionA, optionB, answer } = req.body;

        if (!question || !optionA || !optionB || !answer) {
            return res.status(400).json({ message: "Question, options, and answer are required." });
        }

        const item = {
            id: createRecordId(),
            question,
            optionA,
            optionB,
            answer,
            createdAt: new Date().toISOString()
        };

        quizItems.unshift(item);
        res.status(201).json({ success: true, message: "Quiz item added.", item });
    } catch (err) {
        console.error("CREATE QUIZ ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.delete("/admin/quiz/:id", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const index = quizItems.findIndex(item => item.id === id);

        if (index === -1) {
            return res.status(404).json({ message: "Quiz item not found." });
        }

        quizItems.splice(index, 1);
        res.json({ success: true, message: "Quiz item removed." });
    } catch (err) {
        console.error("DELETE QUIZ ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// GOOGLE LOGIN
app.get("/auth/google", (req, res) => {
    const url =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_REDIRECT}&response_type=code&scope=email profile`;

    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) return res.redirect("/login");

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
        if (!user?.email) return res.redirect("/login");

        const { data: existingUser, error: existingError } = await supabase
            .from("student")
            .select("*")
            .eq("email", user.email)
            .maybeSingle();

        if (existingError) throw existingError;

        let data;
        let error;

        if (existingUser) {
            ({ data, error } = await supabase
                .from("student")
                .update({
                    username: user.name || existingUser.username,
                    provider: "google",
                    role: existingUser.role || "user"
                })
                .eq("email", user.email)
                .select()
                .single());
        } else {
            ({ data, error } = await supabase
                .from("student")
                .insert({
                    email: user.email,
                    username: user.name || user.email,
                    provider: "google",
                    role: "user"
                })
                .select()
                .single());
        }

        if (error) throw error;

        req.session.user = {
            id: data.id,
            email: data.email,
            username: data.username,
            role: data.role || "user"
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
        if (!code) return res.redirect("/login");

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
        const email = userRes.data.email || primaryEmail;

        if (!email) return res.redirect("/login");

        const { data: existingUser, error: existingError } = await supabase
            .from("student")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if (existingError) throw existingError;

        let data;
        let error;

        if (existingUser) {
            ({ data, error } = await supabase
                .from("student")
                .update({
                    username: userRes.data.login || existingUser.username,
                    provider: "github",
                    role: existingUser.role || "user"
                })
                .eq("email", email)
                .select()
                .single());
        } else {
            ({ data, error } = await supabase
                .from("student")
                .insert({
                    email,
                    username: userRes.data.login,
                    provider: "github",
                    role: "user"
                })
                .select()
                .single());
        }

        if (error) throw error;

        req.session.user = {
            id: data.id,
            email: data.email,
            username: data.username,
            role: data.role || "user"
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
app.get("/dashboard", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Not logged in" });
    }

    try {
        const { data, error } = await supabase
            .from("student")
            .select("id, username, email, role, marks")
            .eq("id", req.session.user.id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(data);
    } catch (err) {
        console.error("DASHBOARD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
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