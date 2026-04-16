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

function calculateGpaPoints(item) {
    const existingPoints = Number(getValue(item, ["gpaPoints", "gpa_points"], ""));
    if (!Number.isNaN(existingPoints) && existingPoints >= 0) {
        return existingPoints;
    }

    const grade = String(getValue(item, ["grade"], "")).trim().toUpperCase();
    const marks = Number(getValue(item, ["marks", "score"], 0)) || 0;
    const gradeScale = {
        "A+": 5,
        "A": 5,
        "A-": 4.5,
        "B+": 4,
        "B": 3.5,
        "B-": 3,
        "C+": 2.5,
        "C": 2,
        "C-": 1.5,
        "D": 1,
        "E": 0.5,
        "F": 0
    };

    if (grade && gradeScale[grade] != null) {
        return gradeScale[grade];
    }

    if (marks >= 80) return 5;
    if (marks >= 70) return 4;
    if (marks >= 60) return 3;
    if (marks >= 50) return 2;
    if (marks >= 40) return 1;
    return 0;
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
        const totalGpaPoints = results.reduce((sum, item) => sum + calculateGpaPoints(item), 0);
        const gpa = results.length ? (totalGpaPoints / results.length).toFixed(2) : "--";

        document.getElementById("resultsCount").innerText = results.length;
        document.getElementById("averageScore").innerText = results.length ? `${average}%` : "--";
        document.getElementById("gpaValue").innerText = gpa;
        document.getElementById("performanceLabel").innerText =
            average >= 80 ? "Excellent"
                : average >= 60 ? "Good"
                : average >= 40 ? "Improving"
                : results.length ? "Needs support" : "Waiting";
        document.getElementById("courseCount").innerText = courses.length;
        document.getElementById("messageCount").innerText = messages.length;

        renderRows(
            "resultsTableBody",
            results,
            "No results available yet.",
            item => `
                <tr>
                    <td>${getValue(item, ["courseName", "course_name", "course"], "-")}</td>
                    <td>${getValue(item, ["marks", "score"], "-")}</td>
                    <td>${getValue(item, ["grade"], "-")}</td>
                    <td>${calculateGpaPoints(item).toFixed(2)}</td>
                    <td>${new Date(getValue(item, ["date", "created_at", "createdAt"], Date.now())).toLocaleDateString()}</td>
                </tr>
            `,
            5
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
