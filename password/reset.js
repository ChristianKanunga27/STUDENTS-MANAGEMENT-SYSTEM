// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");

const message = document.getElementById("message");
const resetForm = document.getElementById("resetForm");
const resetBtn = document.getElementById("resetBtn");

function showMessage(text, color) {
    message.style.color = color;
    message.innerText = text;
}

async function resetPassword() {
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!password || !confirmPassword) {
        showMessage("Please fill all fields", "red");
        return;
    }

    if (password.length < 6) {
        showMessage("Password must be at least 6 characters", "red");
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Passwords do not match", "red");
        return;
    }

    if (!token) {
        showMessage("Invalid or missing token", "red");
        return;
    }

    showMessage("Updating password...", "#fbbf24");
    resetBtn.disabled = true;
    resetBtn.innerText = "Updating...";

    try {
        const res = await fetch("/reset", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                token,
                newPassword: password
            })
        });

        const data = await res.json();

        if (!res.ok) {
            showMessage(data.message || "Reset failed", "red");
            return;
        }

        if (data.success) {
            showMessage("Password updated successfully! Redirecting...", "lightgreen");
            resetForm.reset();

            setTimeout(() => {
                window.location.href = "/login";
            }, 2000);
        } else {
            showMessage(data.message || "Reset failed", "red");
        }
    } catch (error) {
        console.error("RESET PASSWORD ERROR:", error);
        showMessage("Server error. Try again later.", "red");
    } finally {
        resetBtn.disabled = false;
        resetBtn.innerText = "Update Password";
    }
}

resetForm.addEventListener("submit", function (event) {
    event.preventDefault();
    resetPassword();
});
