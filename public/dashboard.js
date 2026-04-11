// LOAD USER
async function loadUser() {
    try {
        const res = await fetch("http://localhost:3000/dashboard", {
            credentials: "include"
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data) {
            window.location.href = "/login";
            return;
        }

        document.getElementById("username").innerText = data.username || "User";
        document.getElementById("email").innerText = data.email || "";

        document.getElementById("avatar").innerText =
            (data.username || "U").charAt(0).toUpperCase();

    } catch (err) {
        console.error(err);
        window.location.href = "/login";
    }
}

// LOGOUT
async function logout() {
    await fetch("http://localhost:3000/logout", {
        credentials: "include"
    });

    window.location.href = "/login";
}

loadUser();