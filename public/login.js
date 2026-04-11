async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const btn = document.getElementById("loginBtn");
    const message = document.getElementById("message");

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

        const res = await fetch("http://localhost:3000/login", {
            method: "POST",
            credentials: "include", // 🔥 IMPORTANT FOR SESSION
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            return showMessage(data.message || "Login failed ❌");
        }

        // =========================
        // SUCCESS
        // =========================
        showMessage("Login successful ✅", "green");

        setTimeout(() => {
            // 🔥 FIX: MUST go through Express route
            window.location.href = "/dashboard-page";
        }, 800);

    } catch (err) {
        console.error(err);
        showMessage("Server error ❌ Try again later");
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
// OAUTH LOGIN
// =========================
function googleLogin() {
    window.location.href = "http://localhost:3000/auth/google";
}

function githubLogin() {
    window.location.href = "http://localhost:3000/auth/github";
}