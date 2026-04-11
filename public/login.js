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
        return showMessage("Username must be at least 3 characters");
    }

    if (password.length < 6) {
        return showMessage("Password must be at least 6 characters");
    }

    try {
        btn.innerText = "Logging in...";
        btn.disabled = true;

        const res = await fetch("http://localhost:3000/login", {
            method: "POST",
            credentials: "include", // ✅ VERY IMPORTANT
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok) {
            showMessage("Login successful ✅", "green");

            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1000);
        } else {
            showMessage(data.message || "Login failed ❌");
        }

    } catch (error) {
        console.error(error);
        showMessage("Server error. Try again later ❌");
    } finally {
        btn.innerText = "Login";
        btn.disabled = false;
    }
}

// =========================
// MESSAGE FUNCTION (BETTER UX)
// =========================
function showMessage(msg, color = "red") {
    const box = document.getElementById("message");
    box.innerText = msg;
    box.style.color = color;
}

// =========================
// OAUTH BUTTONS (CONNECTED)
// =========================
function googleLogin() {
    window.location.href = "http://localhost:3000/auth/google";
}

function githubLogin() {
    window.location.href = "http://localhost:3000/auth/github";
}