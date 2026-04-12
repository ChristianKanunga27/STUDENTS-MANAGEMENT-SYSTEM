async function register() {
    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();
    const btn = document.getElementById("registerBtn");

    if (!username || !email || !password) {
        return showMessage("All fields are required ❌");
    }

    if (username.length < 3) {
        return showMessage("Username must be at least 3 characters ❌");
    }

    if (!validateEmail(email)) {
        return showMessage("Invalid email ❌");
    }

    if (confirmPassword !== password) {
        return showMessage("Passwords do not match ❌");
    }

    if (password.length < 6) {
        return showMessage("Password must be at least 6 characters ❌");
    }

    try {
        btn.innerText = "Creating account...";
        btn.disabled = true;

        const res = await fetch("http://localhost:3000/register", { // ✅ SAME ORIGIN
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            return showMessage(data.message || "Registration failed ❌");
        }

        showMessage("Registration successful ✅", "green");

        setTimeout(() => {
            window.location.href = "/login";
        }, 1200);

    } catch (err) {
        console.error(err);
        showMessage("Cannot connect to server ❌");
    } finally {
        btn.innerText = "Register";
        btn.disabled = false;
    }
}