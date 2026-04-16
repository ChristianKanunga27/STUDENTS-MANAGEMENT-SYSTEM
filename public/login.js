// =========================
// LOGIN FUNCTION
// =========================
async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const btn = document.getElementById("loginBtn");

    // =========================
    // VALIDATION
    // =========================
    if (!username || !password) {
        return showMessage("All fields are required ❌");
    }

    if (username.length < 3) {
        return showMessage("Username too short ❌");
    }

    if (password.length < 6) {
        return showMessage("Password must be at least 6 characters ❌");
    }

    try {
        btn.innerText = "Logging in...";
        btn.disabled = true;

        const res = await fetch("/login", {
            method: "POST",
            credentials: "include", // session support
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        // =========================
        // ERROR HANDLING
        // =========================
        if (!res.ok) {
            return showMessage(data.message || "Login failed ?");
        }

        // =========================
        // SUCCESS
        // =========================
        showMessage("Login successful ?", "green");

        setTimeout(() => {
            if (data.redirect) {
                window.location.href = data.redirect;
            } else {
                window.location.href = "/dashboard-page"; // fallback
            }
        }, 800);

    } catch (err) {
        console.error("LOGIN ERROR:", err);
        showMessage("Server error, try again later ?");
    } finally {
        btn.innerText = "Login";
        btn.disabled = false;
    }
}

// =========================
// MESSAGE FUNCTION
// =========================
function showMessage(msg, color = "red") {
    const box = document.getElementById("message");
    box.innerText = msg;
    box.style.color = color;
}

// =========================
// FORGOT PASSWORD NAVIGATION ? FIXED
// =========================
function goToForgotPassword() {
    // since login.html is in /public
    // and forgot.html is in /password
    window.location.href = "../password/forgot.html";
}

// =========================
// OAUTH LOGIN
// =========================
function googleLogin() {
    window.location.href = "/auth/google";
}

function githubLogin() {
    window.location.href = "/auth/github";
}

const loginParams = new URLSearchParams(window.location.search);
const oauthError = loginParams.get("error");

if (oauthError) {
    showMessage(oauthError, "red");
    window.history.replaceState({}, document.title, "/login");
}
