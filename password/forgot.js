function sendReset() {
    const email = document.getElementById("email").value.trim();
    const message = document.getElementById("message");

    if (!email) {
        message.style.color = "red";
        message.innerText = "Please enter your email";
        return;
    }

    message.style.color = "#fbbf24";
    message.innerText = "Sending reset link...";

    fetch("/forgot", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
    })
    .then(res => res.json())
    .then(data => {
        message.style.color = data.message ? "lightgreen" : "red";
        message.innerText = data.message || "Reset link sent!";
    })
    .catch(err => {
        console.error(err);
        message.style.color = "red";
        message.innerText = "Server error. Try again.";
    });
}

document.getElementById("forgotForm").addEventListener("submit", function (event) {
    event.preventDefault();
    sendReset();
});
