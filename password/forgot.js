const forgotForm = document.getElementById("forgotForm");
const emailInput = document.getElementById("email");
const message = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");

function showMessage(text, color) {
    message.style.color = color;
    message.innerText = text;
}

async function sendReset() {
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
        showMessage("Please enter your email", "red");
        return;
    }

    showMessage("Sending reset link...", "#fbbf24");
    sendBtn.disabled = true;
    sendBtn.innerText = "Sending...";

    try {
        const res = await fetch("/forgot", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (!res.ok) {
            showMessage(data.message || "Could not send reset link", "red");
            return;
        }

        showMessage(data.message || "Reset link sent successfully", "lightgreen");
        forgotForm.reset();
    } catch (err) {
        console.error(err);
        showMessage("Server error. Try again.", "red");
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerText = "Send Reset Link";
    }
}

forgotForm.addEventListener("submit", function (event) {
    event.preventDefault();
    sendReset();
});
