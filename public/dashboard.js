function getValue(record, keys, fallback = "") {
    for (const key of keys) {
        if (record && record[key] != null && record[key] !== "") {
            return record[key];
        }
    }

    return fallback;
}

function renderRows(targetId, rows, emptyMessage, rowRenderer, colspan) {
    const body = document.getElementById(targetId);

    if (!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="${colspan}" style="color:#9ca3af;">${emptyMessage}</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = rows.map(rowRenderer).join("");
}

function formatAttendanceStatus(status) {
    return status ? "Present" : "Absent";
}

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
        document.getElementById("avatar").innerText = (data.username || "U").charAt(0).toUpperCase();

        const results = Array.isArray(data.results) ? data.results : Array.isArray(data.marks) ? data.marks : [];
        const attendance = Array.isArray(data.attendance) ? data.attendance : [];
        const courses = Array.isArray(data.courses) ? data.courses : [];
        const messages = Array.isArray(data.messages) ? data.messages : [];

        const totalMarks = results.reduce((sum, item) => sum + (Number(getValue(item, ["marks", "score"], 0)) || 0), 0);
        const average = results.length ? Math.round(totalMarks / results.length) : 0;

        document.getElementById("resultsCount").innerText = results.length;
        document.getElementById("averageScore").innerText = results.length ? `${average}` : "--";
        document.getElementById("performanceLabel").innerText =
            average >= 80 ? "Excellent"
                : average >= 60 ? "Good"
                : average >= 40 ? "Improving"
                : results.length ? "Needs support" : "Waiting";
        document.getElementById("courseCount").innerText = courses.length;
        document.getElementById("messageCount").innerText = messages.length;

        renderRows(
            "resultsTableBody",
            results.slice().reverse(),
            "No results available yet.",
            item => `
                <tr>
                    <td>${getValue(item, ["marks", "score"], "-")}</td>
                    <td>${getValue(item, ["grade"], "-")}</td>
                    <td>${new Date(getValue(item, ["date", "created_at", "createdAt"], Date.now())).toLocaleDateString()}</td>
                </tr>
            `,
            3
        );

        renderRows(
            "attendanceTableBody",
            attendance,
            "No attendance uploaded for you yet.",
            item => `
                <tr>
                    <td>${getValue(item, ["name", "student_name", "username"], "-")}</td>
                    <td>${formatAttendanceStatus(Boolean(getValue(item, ["status"], false)))}</td>
                    <td>${new Date(getValue(item, ["date", "created_at", "createdAt"], Date.now())).toLocaleDateString()}</td>
                </tr>
            `,
            3
        );

        renderRows(
            "courseTableBody",
            courses,
            "No courses uploaded yet.",
            item => `
                <tr>
                    <td>${getValue(item, ["courseName", "course_name", "title", "name"], "-")}</td>
                    <td>${new Date(getValue(item, ["createdAt", "created_at"], Date.now())).toLocaleDateString()}</td>
                </tr>
            `,
            2
        );

        renderRows(
            "messageTableBody",
            messages
                .slice()
                .sort((a, b) => new Date(getValue(b, ["createdAt", "created_at", "date"], 0)) - new Date(getValue(a, ["createdAt", "created_at", "date"], 0))),
            "No announcements yet.",
            item => `
                <tr>
                    <td>${getValue(item, ["username"], "Admin")}</td>
                    <td>${getValue(item, ["content", "message"], "-")}</td>
                    <td>${new Date(getValue(item, ["createdAt", "created_at", "date"], Date.now())).toLocaleDateString()}</td>
                </tr>
            `,
            3
        );
    } catch (error) {
        console.error("DASHBOARD LOAD ERROR:", error);
        window.location.href = "/login";
    }
}

async function logout() {
    await fetch("/logout", {
        credentials: "include"
    });

    window.location.href = "/login";
}

loadUser();
