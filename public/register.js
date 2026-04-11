async function register() {
    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const btn = document.getElementById("registerBtn");

    // =========================
    // VALIDATION
    // =========================
    if (!username || !email || !password) {
        return showMessage("All fields are required ❌");
    }

    if (username.length < 3) {
        return showMessage("Username must be at least 3 characters");
    }

    if (!validateEmail(email)) {
        return showMessage("Invalid email format");
    }

    if (password.length < 6) {
        return showMessage("Password must be at least 6 characters");
    }

    try {
        btn.innerText = "Creating account...";
        btn.disabled = true;

        const res = await fetch("http://localhost:3000/register", {
            method: "POST",
            credentials: "include", // ✅ IMPORTANT
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (res.ok) {
            showMessage("Registration successful ✅", "green");

            setTimeout(() => {
                window.location.href = "login.html";
            }, 1200);
        } else {
            showMessage(data.message || "Registration failed ❌");
        }

    } catch (err) {
        console.error(err);
        showMessage("Server error. Try again later ❌");
    } finally {
        btn.innerText = "Register";
        btn.disabled = false;
    }
}

// =========================
// EMAIL VALIDATION
// =========================
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =========================
// MESSAGE BOX
// =========================
function showMessage(msg, color = "red") {
    const box = document.getElementById("message");
    box.innerText = msg;
    box.style.color = color;
}

// =========================
// OAUTH (CONNECTED)
// =========================
function googleLogin() {
    window.location.href = "http://localhost:3000/auth/google";
}

function githubLogin() {
    window.location.href = "http://localhost:3000/auth/github";
}