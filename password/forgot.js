
function sendReset() {
    const email = document.getElementById("email").value;
    const message = document.getElementById("message");

    if (!email) {
        message.style.color = "red";
        message.innerText = "Please enter your email";
        return;
    }

    message.style.color = "#fbbf24";
    message.innerText = "Sending reset link...";

    // 🔗 Connect to backend later (Node.js / Express)
    fetch("http://localhost:3000/forgot", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
    })
    .then(res => res.json())
    .then(data => {
        message.style.color = "lightgreen";
        message.innerText = data.message || "Reset link sent!";
    })
    .catch(err => {
        message.style.color = "red";
        message.innerText = "Server error. Try again.";
    });
}