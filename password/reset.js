// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");

const message = document.getElementById("message");

function resetPassword() {
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // Validation
    if (!password || !confirmPassword) {
        message.style.color = "red";
        message.innerText = "Please fill all fields";
        return;
    }

    if (password.length < 6) {
        message.style.color = "red";
        message.innerText = "Password must be at least 6 characters";
        return;
    }

    if (password !== confirmPassword) {
        message.style.color = "red";
        message.innerText = "Passwords do not match";
        return;
    }

    if (!token) {
        message.style.color = "red";
        message.innerText = "Invalid or missing token";
        return;
    }

    message.style.color = "#fbbf24";
    message.innerText = "Updating password...";

    fetch("/reset", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            token,
            newPassword: password
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            message.style.color = "lightgreen";
            message.innerText = "Password updated successfully! Redirecting...";

            setTimeout(() => {
                window.location.href = "/login";
            }, 2000);
        } else {
            message.style.color = "red";
            message.innerText = data.message || "Reset failed";
        }
    })
    .catch(() => {
        message.style.color = "red";
        message.innerText = "Server error. Try again later.";
    });
}
