// LOAD USER
async function loadUser() {
    try {
        const res = await fetch("/dashboard", {
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
        document.getElementById("role").innerText = `Role: ${data.role || "user"}`;

        const marks = Array.isArray(data.marks) ? data.marks : [];
        const marksCount = marks.length;
        const totalScore = marks.reduce((sum, mark) => sum + (Number(mark.score) || 0), 0);
        const totalMax = marks.reduce((sum, mark) => sum + (Number(mark.maxScore) || 0), 0);
        const average = marksCount && totalMax ? Math.round((totalScore / totalMax) * 100) : 0;

        document.getElementById("marksCount").innerText = marksCount;
        document.getElementById("averageScore").innerText = average ? `${average}%` : "--%";
        document.getElementById("performanceLabel").innerText =
            average >= 85 ? "Excellent"
                : average >= 70 ? "Good"
                : average >= 50 ? "Improving"
                : "Needs support";

        const tbody = document.getElementById("marksTableBody");

        if (!marksCount) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="color:#9ca3af;">No grades available yet.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = marks
            .slice(-6)
            .reverse()
            .map(mark => `
                <tr>
                    <td>${mark.subject || "-"}</td>
                    <td>${mark.score ?? "-"}</td>
                    <td>${mark.maxScore ?? "-"}</td>
                    <td>${new Date(mark.date).toLocaleDateString()}</td>
                </tr>
            `)
            .join("");

    } catch (err) {
        console.error(err);
        window.location.href = "/login";
    }
}

// LOGOUT
async function logout() {
    await fetch("/logout", {
        credentials: "include"
    });

    window.location.href = "/login";
}

loadUser();