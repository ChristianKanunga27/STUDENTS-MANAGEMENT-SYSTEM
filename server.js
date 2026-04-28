//IMPORTING IMPORTANT MODULE
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const axios = require("axios");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const supabase = require("./supabase");
const serverless = require("serverless-http");
const sendEmail = require("./password/mailer");

const app = express();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const isProd = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required in production");
}

//TRUST PROXY
app.set("trust proxy", 1);

//MIDDLEWARES
const corsOrigin = isProd && process.env.APP_URL
    ? process.env.APP_URL
    : true;

app.use(cors({
    origin: corsOrigin,
    credentials: true
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/password", express.static(path.join(__dirname, "password")));


// SESSION CONFIG

app.use(session({
    name: "session_id",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true, // IMPORTANT for Vercel / HTTPS proxy

    cookie: {
        httpOnly: true,
        secure: isProd, // HTTPS only in production
        sameSite: isProd ? "none" : "lax", // REQUIRED for Google/GitHub OAuth
        maxAge: 24 * 60 * 60 * 1000
    }
}));

 
// AUTH MIDDLEWARE
 
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

function normalizeEmail(email = "") {
    return email.trim().toLowerCase();
}

function getEnvValue(name) {
    return (process.env[name] || "").trim();
}

function buildResetLink(req, token) {
    const appUrl = getEnvValue("APP_URL")
        ? getEnvValue("APP_URL").replace(/\/$/, "")
        : `${req.protocol}://${req.get("host")}`;

    return `${appUrl}/password/reset.html?token=${token}`;
}

function getAppBaseUrl(req) {
    return getEnvValue("APP_URL")
        ? getEnvValue("APP_URL").replace(/\/$/, "")
        : `${req.protocol}://${req.get("host")}`;
}

function getGoogleRedirectUrl(req) {
    return getEnvValue("GOOGLE_REDIRECT") || `${getAppBaseUrl(req)}/auth/google/callback`;
}

function getGithubRedirectUrl(req) {
    return getEnvValue("GITHUB_REDIRECT") || `${getAppBaseUrl(req)}/auth/github/callback`;
}

function redirectToLoginWithError(res, message) {
    return res.redirect(`/login?error=${encodeURIComponent(message)}`);
}

function createOauthState() {
    return crypto.randomBytes(24).toString("hex");
}

function getResetExpiryTimestamp(value) {
    if (!value) return null;
    if (typeof value === "number") return value;

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
}

function createPasswordResetToken(user) {
    const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
    const passwordFingerprint = crypto
        .createHash("sha256")
        .update(String(user.password || user.email || user.id))
        .digest("hex")
        .slice(0, 16);

    const payload = Buffer.from(JSON.stringify({
        userId: user.id,
        expiresAt,
        passwordFingerprint
    })).toString("base64url");

    const signature = crypto
        .createHmac("sha256", process.env.SESSION_SECRET)
        .update(payload)
        .digest("base64url");

    return `${payload}.${signature}`;
}

function verifyPasswordResetToken(token) {
    if (!token || !token.includes(".")) {
        throw new Error("Invalid reset token");
    }

    const [payload, signature] = token.split(".");
    const expectedSignature = crypto
        .createHmac("sha256", process.env.SESSION_SECRET)
        .update(payload)
        .digest("base64url");

    if (signature !== expectedSignature) {
        throw new Error("Invalid reset token");
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (!decoded?.userId || !decoded?.expiresAt || !decoded?.passwordFingerprint) {
        throw new Error("Invalid reset token");
    }

    if (Number(decoded.expiresAt) < Date.now()) {
        throw new Error("Reset token expired");
    }

    return decoded;
}

const TABLE_ALIASES = {
    attendance: ["attendence", "attendance"],
    result: ["Result", "result", "results"],
    message: ["message"],
    course: ["course", "courses"]
};

function isSchemaRetryableError(error) {
    const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();

    return Boolean(
        error?.code === "PGRST205" ||
        text.includes("could not find the table") ||
        text.includes("relation") ||
        text.includes("schema cache") ||
        text.includes("column") ||
        text.includes("null value")
    );
}

async function runWithTableAliases(kind, runner) {
    const aliases = TABLE_ALIASES[kind] || [kind];
    let lastError = null;

    for (const tableName of aliases) {
        try {
            return await runner(tableName);
        } catch (error) {
            lastError = error;

            if (!isSchemaRetryableError(error)) {
                throw error;
            }
        }
    }

    if (lastError) throw lastError;
    throw new Error(`No table aliases configured for ${kind}`);
}

async function insertWithVariants(kind, payloadVariants) {
    return runWithTableAliases(kind, async (tableName) => {
        let lastError = null;
        const attempts = [];

        for (const payload of payloadVariants) {
            const { data, error } = await supabase
                .from(tableName)
                .insert(payload)
                .select()
                .single();

            if (!error) {
                return { data, tableName };
            }

            lastError = error;
            attempts.push({
                payload,
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });

            if (!isSchemaRetryableError(error)) {
                throw error;
            }
        }

        if (lastError) {
            lastError.attempts = attempts;
        }

        throw lastError;
    });
}

async function fetchAllFromTable(kind) {
    const { data } = await runWithTableAliases(kind, async (tableName) => {
        const response = await supabase.from(tableName).select("*");
        if (response.error) throw response.error;
        return response;
    });

    return Array.isArray(data) ? data : [];
}

async function deleteByIdFromTable(kind, id) {
    await runWithTableAliases(kind, async (tableName) => {
        const response = await supabase.from(tableName).delete().eq("id", id);
        if (response.error) throw response.error;
        return response;
    });
}

function getField(record, keys, fallback = null) {
    for (const key of keys) {
        if (record && record[key] != null && record[key] !== "") {
            return record[key];
        }
    }

    return fallback;
}

function formatAdminWriteError(error) {
    const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(" | ");
    const lower = details.toLowerCase();

    if (lower.includes("row-level security policy")) {
        return "Supabase RLS blocked this admin write. Add the real SUPABASE_SERVICE_ROLE_KEY to .env and restart the server.";
    }

    return details || "Server error";
}

function normalizeResultRecord(record) {
    return {
        id: getField(record, ["id"]),
        studentId: String(getField(record, ["student_id", "user_id", "studentId", "userId"], "")),
        studentEmail: String(getField(record, ["student_email", "email", "studentEmail"], "")).toLowerCase(),
        studentName: getField(record, ["student_name", "name", "username", "studentName"], ""),
        courseName: getField(record, ["course_name", "courseName", "course"], ""),
        marks: Number(getField(record, ["marks", "score", "result_score"], 0)) || 0,
        grade: getField(record, ["grade", "result_grade"], ""),
        gpaPoints: Number(getField(record, ["gpa_points", "gpaPoints"], 0)) || 0,
        date: getField(record, ["created_at", "date", "createdAt"], new Date().toISOString())
    };
}

function normalizeStoredMarks(records) {
    if (!Array.isArray(records)) return [];

    return records.map(record => ({
        id: getField(record, ["id"]),
        studentId: String(getField(record, ["student_id", "user_id", "studentId", "userId"], "")),
        studentEmail: String(getField(record, ["student_email", "email", "studentEmail"], "")).toLowerCase(),
        studentName: getField(record, ["student_name", "name", "username", "studentName"], ""),
        courseName: getField(record, ["course_name", "courseName", "course"], ""),
        marks: Number(getField(record, ["marks", "score", "result_score"], 0)) || 0,
        grade: getField(record, ["grade", "result_grade"], ""),
        gpaPoints: Number(getField(record, ["gpa_points", "gpaPoints"], 0)) || 0,
        date: getField(record, ["created_at", "date", "createdAt"], new Date().toISOString())
    }));
}

function calculateGpaPoints(marks, grade = "") {
    const numericMarks = Number(marks);
    const normalizedGrade = String(grade || "").trim().toUpperCase();
    const gradeScale = {
        "A+": 5,
        "A": 5,
        "A-": 4.5,
        "B+": 4,
        "B": 3.5,
        "B-": 3,
        "C+": 2.5,
        "C": 2,
        "C-": 1.5,
        "D": 1,
        "E": 0.5,
        "F": 0
    };

    if (normalizedGrade && gradeScale[normalizedGrade] != null) {
        return gradeScale[normalizedGrade];
    }

    if (Number.isNaN(numericMarks)) return 0;
    if (numericMarks >= 80) return 5;
    if (numericMarks >= 70) return 4;
    if (numericMarks >= 60) return 3;
    if (numericMarks >= 50) return 2;
    if (numericMarks >= 40) return 1;
    return 0;
}

function mergeResultsWithFallback(primaryResults, fallbackResults) {
    const normalizedPrimary = normalizeStoredMarks(primaryResults);
    const normalizedFallback = normalizeStoredMarks(fallbackResults);
    const merged = [];
    const seen = new Set();

    for (const item of [...normalizedFallback, ...normalizedPrimary]) {
        const key = [
            item.courseName || "",
            item.marks,
            item.grade || "",
            new Date(item.date).toISOString()
        ].join("|");

        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
            ...item,
            gpaPoints: item.gpaPoints || calculateGpaPoints(item.marks, item.grade)
        });
    }

    return merged.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function normalizeAttendanceRecord(record) {
    return {
        id: getField(record, ["id"]),
        studentId: String(getField(record, ["student_id", "studentId"], "")),
        name: getField(record, ["student_name", "studentName", "name", "title"], ""),
        date: getField(record, ["date", "created_at", "createdAt"], new Date().toISOString()),
        status: Boolean(getField(record, ["status"], false))
    };
}

function normalizeCourseRecord(record) {
    return {
        id: getField(record, ["id"]),
        courseName: getField(record, ["course_name", "title", "name"], "Untitled course"),
        createdAt: getField(record, ["created_at", "createdAt"], new Date().toISOString())
    };
}

function normalizeMessageRecord(record) {
    const content = getField(record, ["content", "message"], "");
    const fallbackTitle = content
        ? String(content).split("\n")[0].slice(0, 60)
        : "Announcement";

    return {
        id: getField(record, ["id"]),
        username: getField(record, ["username"], "Admin"),
        title: fallbackTitle,
        content,
        createdAt: getField(record, ["created_at", "date", "createdAt"], new Date().toISOString())
    };
}

async function fetchStudentResults(user) {
    const results = await fetchAllFromTable("result");

    return results
        .map(normalizeResultRecord)
        .filter(result =>
            (result.studentId && String(result.studentId) === String(user.id)) ||
            (result.studentEmail && result.studentEmail === normalizeEmail(user.email))
        );
}

async function fetchStudentAttendance(user) {
    const rows = await fetchAllFromTable("attendance");

    return rows
        .map(normalizeAttendanceRecord)
        .filter(record => record.studentId && String(record.studentId) === String(user.id));
}

 
// PAGES

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/login", (req, res) =>
    res.sendFile(path.join(__dirname, "public/index.html"))
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

 
// REGISTER ROOT

app.post("/register", async (req, res) => {
    try {
        const username = (req.body.username || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = req.body.password;

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

 
// LOGIN ROOT
 
app.post("/login", async (req, res) => {
    try {
        const username = (req.body.username || "").trim();
        const password = req.body.password;
        const normalizedLogin = normalizeEmail(username);

        const { data: userByUsername, error: usernameError } = await supabase
            .from("student")
            .select("*")
            .eq("username", username)
            .maybeSingle();

        const { data: userByEmail, error: emailError } = await supabase
            .from("student")
            .select("*")
            .eq("email", normalizedLogin)
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

 
// FORGOT PASSWORD
 
app.post("/forgot", async (req, res) => {
    const email = normalizeEmail(req.body.email);

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    try {
        const { data: user, error } = await supabase
            .from("student")
            .select("id, email, username, password")
            .eq("email", email)
            .maybeSingle();

        if (error) throw error;

        if (!user) {
            return res.status(404).json({ message: "Email does not exist in the database" });
        }

        const resetToken = createPasswordResetToken(user);

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
            console.error("EMAIL SEND ERROR:", emailError);
            const details = [emailError?.message, emailError?.response].filter(Boolean).join(" | ");
            return res.status(500).json({
                message: details || "Reset email could not be sent. Please try again."
            });
        }

        res.json({ success: true, message: "Reset email sent successfully" });
    } catch (err) {
        console.error("FORGOT PASSWORD ERROR:", err);
        const details = [err?.message, err?.details, err?.hint].filter(Boolean).join(" | ");
        res.status(500).json({ message: details || "Server error" });
    }
});

 
// RESET PASSWORD
 
app.post("/reset", async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
        const decodedToken = verifyPasswordResetToken(token);

        const { data: user, error } = await supabase
            .from("student")
            .select("id, email, password")
            .eq("id", decodedToken.userId)
            .maybeSingle();

        if (error) throw error;

        if (!user) {
            return res.status(400).json({ message: "Invalid token" });
        }

        const passwordFingerprint = crypto
            .createHash("sha256")
            .update(String(user.password || user.email || user.id))
            .digest("hex")
            .slice(0, 16);

        if (passwordFingerprint !== decodedToken.passwordFingerprint) {
            return res.status(400).json({ message: "Reset token is no longer valid" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const { error: updateError } = await supabase
            .from("student")
            .update({ password: hashedPassword })
            .eq("id", user.id);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Password reset successful" });
    } catch (err) {
        console.error("RESET PASSWORD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ADMIN ROLE MANAGEMENT
 
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

 
// ADMIN STUDENT MANAGEMENT
 
app.get("/admin/students", isAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("student")
            .select("*");

        if (error) throw error;

        let resultRows = [];
        try {
            resultRows = await fetchAllFromTable("result");
        } catch (resultError) {
            console.error("RESULT FETCH WARNING:", resultError.message || resultError);
        }

        const normalizedResults = resultRows.map(normalizeResultRecord);

        const students = data.map(user => {
            const { password, reset_token, reset_token_expiry, ...rest } = user;
            const studentResults = normalizedResults.filter(result =>
                (result.studentId && String(result.studentId) === String(user.id)) ||
                (result.studentEmail && result.studentEmail === normalizeEmail(user.email))
            );

            let fallbackMarks = [];
            if (Array.isArray(rest.marks)) {
                fallbackMarks = rest.marks;
            } else if (rest.marks) {
                try {
                    const parsedMarks = JSON.parse(rest.marks);
                    fallbackMarks = Array.isArray(parsedMarks) ? parsedMarks : [];
                } catch {
                    fallbackMarks = [];
                }
            }

            return {
                ...rest,
                marks: mergeResultsWithFallback(studentResults, fallbackMarks)
            };
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
        res.status(500).json({ message: formatAdminWriteError(err) });
    }
});

app.post("/admin/students/:id/marks", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { marks: resultMarks, grade, courseName } = req.body;

        if (!id || resultMarks == null || !grade || !courseName) {
            return res.status(400).json({ message: "Student id, course, marks, and grade are required" });
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

        const normalizedCourseName = String(courseName).trim();
        const availableCourses = await fetchAllFromTable("course").then(rows => rows.map(normalizeCourseRecord)).catch(() => []);
        const matchedCourse = availableCourses.find(course =>
            String(course.courseName || "").trim().toLowerCase() === normalizedCourseName.toLowerCase()
        );

        if (!matchedCourse) {
            return res.status(400).json({ message: "Selected course was not found. Please create the course first." });
        }

        const resultDate = new Date().toISOString();
        const normalizedMarks = Number(resultMarks);
        const normalizedGrade = String(grade).trim().toUpperCase();
        const gpaPoints = calculateGpaPoints(normalizedMarks, normalizedGrade);

        try {
            await runWithTableAliases("result", async (tableName) => {
                const response = await supabase
                    .from(tableName)
                    .insert({
                        student_id: Number(student.id),
                        marks: normalizedMarks,
                        grade: normalizedGrade,
                        created_at: resultDate
                    })
                    .select()
                    .single();

                if (response.error) throw response.error;
                return response;
            });
        } catch (resultInsertError) {
            console.error("RESULT INSERT WARNING:", resultInsertError);
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

        const normalizedStoredMarks = normalizeStoredMarks(marks).filter(item =>
            String(item.courseName || "").trim().toLowerCase() !== normalizedCourseName.toLowerCase()
        );

        normalizedStoredMarks.push({
            courseName: matchedCourse.courseName,
            marks: normalizedMarks,
            grade: normalizedGrade,
            gpaPoints,
            date: resultDate
        });

        const { error: updateError } = await supabase
            .from("student")
            .update({ marks: normalizedStoredMarks })
            .eq("id", id);

        if (updateError) throw updateError;

        res.json({ success: true, message: "Result added successfully" });
    } catch (err) {
        console.error("ADD MARK ERROR:", err);
        res.status(500).json({ message: formatAdminWriteError(err) });
    }
});

app.get("/admin/attendance", isAdmin, async (req, res) => {
    try {
        const rows = await fetchAllFromTable("attendance");
        res.json({ attendance: rows.map(normalizeAttendanceRecord) });
    } catch (err) {
        console.error("GET ATTENDANCE ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/admin/attendance", isAdmin, async (req, res) => {
    try {
        const { studentId, date, status } = req.body;

        if (!studentId || !date || typeof status !== "boolean") {
            return res.status(400).json({ message: "Student id, date, and boolean status are required." });
        }

        const { data: student, error: studentError } = await supabase
            .from("student")
            .select("id, username")
            .eq("id", studentId)
            .maybeSingle();

        if (studentError) throw studentError;
        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        const createdAt = new Date().toISOString();
        const { data } = await runWithTableAliases("attendance", async (tableName) => {
            const response = await supabase
                .from(tableName)
                .insert({
                    student_id: Number(studentId),
                    date: new Date(date).toISOString(),
                    status
                })
                .select()
                .single();

            if (response.error) throw response.error;
            return response;
        });

        res.status(201).json({
            success: true,
            message: "Attendance recorded.",
            record: normalizeAttendanceRecord({
                ...(data || {}),
                student_id: student.id,
                student_name: student.username,
                date: getField(data || {}, ["date"], new Date(date).toISOString()),
                status
            })
        });
    } catch (err) {
        console.error("CREATE ATTENDANCE ERROR:", err);
        res.status(500).json({ message: formatAdminWriteError(err) });
    }
});

app.delete("/admin/attendance/:id", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        await deleteByIdFromTable("attendance", id);
        res.json({ success: true, message: "Attendance record removed." });
    } catch (err) {
        console.error("DELETE ATTENDANCE ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.get("/admin/courses", isAdmin, async (req, res) => {
    try {
        const rows = await fetchAllFromTable("course");
        res.json({ courses: rows.map(normalizeCourseRecord) });
    } catch (err) {
        console.error("GET COURSES ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/admin/courses", isAdmin, async (req, res) => {
    try {
        const { courseName } = req.body;

        if (!courseName) {
            return res.status(400).json({ message: "Course name is required." });
        }

        const createdAt = new Date().toISOString();
        const { data } = await runWithTableAliases("course", async (tableName) => {
            const response = await supabase
                .from(tableName)
                .insert({
                    course_name: courseName,
                    created_at: createdAt
                })
                .select()
                .single();

            if (response.error) throw response.error;
            return response;
        });

        res.status(201).json({
            success: true,
            message: "Course saved successfully.",
            course: normalizeCourseRecord(data || { course_name: courseName, created_at: createdAt })
        });
    } catch (err) {
        console.error("CREATE COURSE ERROR:", err);
        res.status(500).json({ message: formatAdminWriteError(err) });
    }
});

app.delete("/admin/courses/:id", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        await deleteByIdFromTable("course", id);
        res.json({ success: true, message: "Course removed." });
    } catch (err) {
        console.error("DELETE COURSE ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.get("/admin/messages", isAdmin, async (req, res) => {
    try {
        const rows = await fetchAllFromTable("message");
        res.json({ messages: rows.map(normalizeMessageRecord) });
    } catch (err) {
        console.error("GET MESSAGES ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/admin/messages", isAdmin, async (req, res) => {
    try {
        const { title, content } = req.body;
        const trimmedTitle = (title || "").trim();
        const trimmedContent = (content || "").trim();

        if (!trimmedContent) {
            return res.status(400).json({ message: "Message content is required." });
        }

        const createdAt = new Date().toISOString();
        const mergedMessage = trimmedTitle
            ? `${trimmedTitle}\n${trimmedContent}`
            : trimmedContent;
        const authorName = req.session.user?.username || "Admin";

        const { data } = await runWithTableAliases("message", async (tableName) => {
            const response = await supabase
                .from(tableName)
                .insert({
                    username: authorName,
                    content: mergedMessage,
                    message: mergedMessage,
                    created_at: createdAt
                })
                .select()
                .single();

            if (response.error) throw response.error;
            return response;
        });

        res.status(201).json({
            success: true,
            message: "Message published successfully.",
            messageItem: normalizeMessageRecord(data || {
                username: authorName,
                content: mergedMessage,
                message: mergedMessage,
                created_at: createdAt
            })
        });
    } catch (err) {
        console.error("CREATE MESSAGE ERROR:", err);
        const details = formatAdminWriteError(err);
        const attempts = Array.isArray(err?.attempts)
            ? err.attempts
                .map(attempt => {
                    const keys = Object.keys(attempt.payload || {}).join(", ");
                    const reason = [attempt.message, attempt.details, attempt.hint].filter(Boolean).join(" | ");
                    return keys ? `[${keys}] ${reason}` : reason;
                })
                .join(" || ")
            : "";

        res.status(500).json({
            message: details,
            debug: attempts || undefined
        });
    }
});

app.delete("/admin/messages/:id", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        await deleteByIdFromTable("message", id);
        res.json({ success: true, message: "Message removed." });
    } catch (err) {
        console.error("DELETE MESSAGE ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

 
// LOGIN VIA GOOGLE
app.get("/auth/google", (req, res) => {
    const clientId = getEnvValue("GOOGLE_CLIENT_ID");
    if (!clientId) {
        return redirectToLoginWithError(res, "Google login is not configured");
    }

    const state = createOauthState();
    req.session.oauth_google_state = state;

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: getGoogleRedirectUrl(req),
        response_type: "code",
        scope: "email profile",
        state,
        prompt: "select_account"
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        const code = req.query.code;
        const state = req.query.state;

        if (!code) return redirectToLoginWithError(res, "Google login was cancelled");
        if (!state || state !== req.session.oauth_google_state) {
            return redirectToLoginWithError(res, "Google login state is invalid");
        }

        delete req.session.oauth_google_state;

        const tokenRes = await axios.post(
            "https://oauth2.googleapis.com/token",
            new URLSearchParams({
                client_id: getEnvValue("GOOGLE_CLIENT_ID"),
                client_secret: getEnvValue("GOOGLE_CLIENT_SECRET"),
                code,
                grant_type: "authorization_code",
                redirect_uri: getGoogleRedirectUrl(req)
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const access_token = tokenRes.data.access_token;

        const userRes = await axios.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            { headers: { Authorization: `Bearer ${access_token}` } }
        );

        const user = userRes.data;
        if (!user?.email) return redirectToLoginWithError(res, "Google account email was not provided");

        const { data: existingUser, error: existingError } = await supabase
            .from("student")
            .select("*")
            .eq("email", normalizeEmail(user.email))
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
                .eq("email", normalizeEmail(user.email))
                .select()
                .single());
        } else {
            const oauthPassword = await bcrypt.hash(crypto.randomUUID(), 10);
            ({ data, error } = await supabase
                .from("student")
                .insert({
                    email: normalizeEmail(user.email),
                    username: user.name || user.email,
                    password: oauthPassword,
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

        req.session.save((saveError) => {
            if (saveError) {
                console.error("GOOGLE SESSION SAVE ERROR:", saveError);
                return redirectToLoginWithError(res, "Google session could not be created");
            }

            return res.redirect(
                data.role === "admin"
                    ? "/admin-page"
                    : "/dashboard-page"
            );
        });

    } catch (err) {
        console.error("GOOGLE ERROR:", err);
        redirectToLoginWithError(res, "Google login failed");
    }
});


// LOGIN VIA GITHUB
 
app.get("/auth/github", (req, res) => {
    const clientId = getEnvValue("GITHUB_CLIENT_ID");
    if (!clientId) {
        return redirectToLoginWithError(res, "GitHub login is not configured");
    }

    const state = createOauthState();
    req.session.oauth_github_state = state;

    const params = new URLSearchParams({
        client_id: clientId,
        scope: "user:email",
        state,
        redirect_uri: getGithubRedirectUrl(req)
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

app.get("/auth/github/callback", async (req, res) => {
    try {
        const code = req.query.code;
        const state = req.query.state;

        if (!code) return redirectToLoginWithError(res, "GitHub login was cancelled");
        if (!state || state !== req.session.oauth_github_state) {
            return redirectToLoginWithError(res, "GitHub login state is invalid");
        }

        delete req.session.oauth_github_state;

        const tokenRes = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: getEnvValue("GITHUB_CLIENT_ID"),
                client_secret: getEnvValue("GITHUB_CLIENT_SECRET"),
                code,
                redirect_uri: getGithubRedirectUrl(req)
            },
            { headers: { Accept: "application/json" } }
        );

        const access_token = tokenRes.data.access_token;
        if (!access_token) {
            return redirectToLoginWithError(res, "GitHub did not return an access token");
        }

        const userRes = await axios.get("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${access_token}`,
                "User-Agent": "student-management-system"
            }
        });

        const emailRes = await axios.get("https://api.github.com/user/emails", {
            headers: {
                Authorization: `Bearer ${access_token}`,
                "User-Agent": "student-management-system"
            }
        });

        const primaryEmail = emailRes.data.find(e => e.primary && e.verified)?.email
            || emailRes.data.find(e => e.primary)?.email
            || emailRes.data.find(e => e.verified)?.email;
        const email = normalizeEmail(userRes.data.email || primaryEmail || "");

        if (!email) return redirectToLoginWithError(res, "GitHub account email was not provided");

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
            const oauthPassword = await bcrypt.hash(crypto.randomUUID(), 10);
            ({ data, error } = await supabase
                .from("student")
                .insert({
                    email,
                    username: userRes.data.login,
                    password: oauthPassword,
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

        req.session.save((saveError) => {
            if (saveError) {
                console.error("GITHUB SESSION SAVE ERROR:", saveError);
                return redirectToLoginWithError(res, "GitHub session could not be created");
            }

            return res.redirect(
                data.role === "admin"
                    ? "/admin-page"
                    : "/dashboard-page"
            );
        });

    } catch (err) {
        console.error("GITHUB ERROR:", err);
        redirectToLoginWithError(res, "GitHub login failed");
    }
});

 
// DASHBOARD API
 
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

        const [results, attendance, courses, messages] = await Promise.all([
            fetchStudentResults(req.session.user).catch(() => []),
            fetchStudentAttendance(req.session.user).catch(() => []),
            fetchAllFromTable("course").then(rows => rows.map(normalizeCourseRecord)).catch(() => []),
            fetchAllFromTable("message").then(rows => rows.map(normalizeMessageRecord)).catch(() => [])
        ]);

        let fallbackMarks = [];
        if (Array.isArray(data.marks)) {
            fallbackMarks = data.marks;
        } else if (data.marks) {
            try {
                const parsedMarks = JSON.parse(data.marks);
                fallbackMarks = Array.isArray(parsedMarks) ? parsedMarks : [];
            } catch {
                fallbackMarks = [];
            }
        }

        const visibleResults = mergeResultsWithFallback(results, fallbackMarks);

        res.json({
            ...data,
            marks: visibleResults,
            results: visibleResults,
            attendance,
            courses,
            messages
        });
    } catch (err) {
        console.error("DASHBOARD ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

 
// LOGOUT
 
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// START RUNNING SERVER (local dev only)
/*const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "production" || require.main === module) {
    app.listen(PORT, () => {
        console.log(` Now Server running on http://localhost:${PORT}`);
    });
}*/

// Export for serverless (Vercel)
module.exports = serverless(app);
