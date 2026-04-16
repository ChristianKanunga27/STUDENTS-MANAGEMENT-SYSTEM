let currentSection = "dashboard";
let adminStudents = [];
let attendanceRecords = [];
let courses = [];
let messages = [];

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("active");
    document.querySelector(".overlay").classList.toggle("active");
}

function setMessage(id, text, color) {
    const element = document.getElementById(id);
    if (!element) return;
    element.innerText = text;
    element.style.color = color;
}

function getValue(record, keys, fallback = "") {
    for (const key of keys) {
        if (record && record[key] != null && record[key] !== "") {
            return record[key];
        }
    }

    return fallback;
}

function formatAttendanceStatus(status) {
    return status ? "Present" : "Absent";
}

async function readJson(res) {
    return res.json().catch(() => ({}));
}

async function showSection(section) {
    currentSection = section;

    document.querySelectorAll(".section").forEach(sectionEl => {
        sectionEl.style.display = "none";
    });

    document.getElementById(section).style.display = "block";
    document.getElementById("title").innerText = section.charAt(0).toUpperCase() + section.slice(1);

    if (window.innerWidth <= 768) {
        toggleSidebar();
    }

    if (section === "dashboard" || section === "users") {
        await loadStudents();
        await Promise.all([loadAttendance(), loadCourses(), loadMessages()]);
        renderDashboardStats();
        return;
    }

    if (section === "attendance") {
        await loadAttendance();
        return;
    }

    if (section === "courses") {
        await loadCourses();
        return;
    }

    if (section === "messages") {
        await loadMessages();
    }
}

function renderDashboardStats() {
    const studentCount = adminStudents.filter(student => (student.role || "user") === "user").length;
    const adminCount = adminStudents.filter(student => student.role === "admin").length;
    const allResults = adminStudents.flatMap(student => Array.isArray(student.marks) ? student.marks : []);
    const averageScore = allResults.length
        ? Math.round(
            allResults.reduce((sum, item) => {
                const score = Number(getValue(item, ["marks", "score"], 0)) || 0;
                return sum + score;
            }, 0) / allResults.length
        )
        : 0;

    document.getElementById("dashboardStudentCount").innerText = studentCount;
    document.getElementById("dashboardAdminCount").innerText = adminCount;
    document.getElementById("dashboardAttendanceCount").innerText = attendanceRecords.length;
    document.getElementById("dashboardCourseCount").innerText = courses.length;
    document.getElementById("dashboardMessageCount").innerText = messages.length;
    document.getElementById("averageScore").innerText = `${averageScore}%`;
    document.getElementById("studentCount").innerText = studentCount;
    document.getElementById("adminCount").innerText = adminCount;
}

async function loadStudents() {
    const tableBody = document.getElementById("studentTableBody");
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="6">Loading students...</td></tr>`;
    }

    try {
        const res = await fetch("/admin/students", {
            credentials: "include"
        });
        const data = await readJson(res);

        if (!res.ok) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="6">Unable to load students.</td></tr>`;
            }
            return;
        }

        adminStudents = Array.isArray(data.students) ? data.students : [];
        renderStudentTable();
    } catch (error) {
        console.error("LOAD STUDENTS ERROR:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6">Server error loading students.</td></tr>`;
        }
    }
}

function renderStudentTable() {
    const tableBody = document.getElementById("studentTableBody");
    if (!tableBody) return;

    if (!adminStudents.length) {
        tableBody.innerHTML = `<tr><td colspan="6">No students found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = adminStudents.map(student => `
        <tr>
            <td>${student.id}</td>
            <td>${student.username || "-"}</td>
            <td>${student.email || "-"}</td>
            <td>${student.role || "user"}</td>
            <td>${Array.isArray(student.marks) ? student.marks.length : 0}</td>
            <td>
                <button class="btn refresh" onclick="selectStudent('${student.id}')">Edit</button>
                <button class="btn add" onclick="fillResultStudent('${student.id}')">Add Result</button>
            </td>
        </tr>
    `).join("");
}

function selectStudent(id) {
    const student = adminStudents.find(item => String(item.id) === String(id));
    if (!student) return;

    document.getElementById("editStudentId").value = student.id;
    document.getElementById("editUsername").value = student.username || "";
    document.getElementById("editEmail").value = student.email || "";
    document.getElementById("editRole").value = student.role || "user";
    setMessage("editStudentMessage", "", "#fbbf24");
}

function fillResultStudent(id) {
    document.getElementById("resultStudentId").value = id;
    setMessage("resultMessage", "", "#fbbf24");
}

async function createStudent() {
    const username = document.getElementById("newUsername").value.trim();
    const email = document.getElementById("newEmail").value.trim().toLowerCase();
    const password = document.getElementById("newPassword").value.trim();
    const role = document.getElementById("newRole").value;

    if (!username || !email || !password) {
        setMessage("createStudentMessage", "Username, email, and password are required.", "#ef4444");
        return;
    }

    try {
        setMessage("createStudentMessage", "Creating student...", "#fbbf24");

        const res = await fetch("/admin/students", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email, password, role })
        });

        const data = await readJson(res);
        if (!res.ok) {
            setMessage("createStudentMessage", data.message || "Unable to create student.", "#ef4444");
            return;
        }

        setMessage("createStudentMessage", data.message || "Student created successfully.", "#22c55e");
        document.getElementById("newUsername").value = "";
        document.getElementById("newEmail").value = "";
        document.getElementById("newPassword").value = "";
        document.getElementById("newRole").value = "user";
        await loadStudents();
        renderDashboardStats();
    } catch (error) {
        console.error("CREATE STUDENT ERROR:", error);
        setMessage("createStudentMessage", "Server error. Try again.", "#ef4444");
    }
}

async function updateStudent() {
    const id = document.getElementById("editStudentId").value;
    const username = document.getElementById("editUsername").value.trim();
    const email = document.getElementById("editEmail").value.trim().toLowerCase();
    const role = document.getElementById("editRole").value;

    if (!id || !username || !email) {
        setMessage("editStudentMessage", "Student id, username, and email are required.", "#ef4444");
        return;
    }

    try {
        setMessage("editStudentMessage", "Saving student...", "#fbbf24");

        const res = await fetch(`/admin/students/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email, role })
        });

        const data = await readJson(res);
        if (!res.ok) {
            setMessage("editStudentMessage", data.message || "Unable to save changes.", "#ef4444");
            return;
        }

        setMessage("editStudentMessage", data.message || "Student updated successfully.", "#22c55e");
        await loadStudents();
        renderDashboardStats();
    } catch (error) {
        console.error("UPDATE STUDENT ERROR:", error);
        setMessage("editStudentMessage", "Server error. Try again.", "#ef4444");
    }
}

async function addStudentResult() {
    const id = document.getElementById("resultStudentId").value.trim();
    const marks = document.getElementById("resultMarks").value;
    const grade = document.getElementById("resultGrade").value.trim();

    if (!id || marks === "" || !grade) {
        setMessage("resultMessage", "Student id, marks, and grade are required.", "#ef4444");
        return;
    }

    try {
        setMessage("resultMessage", "Saving result...", "#fbbf24");

        const res = await fetch(`/admin/students/${id}/marks`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ marks: Number(marks), grade })
        });

        const data = await readJson(res);
        if (!res.ok) {
            setMessage("resultMessage", data.message || "Unable to save result.", "#ef4444");
            return;
        }

        setMessage("resultMessage", data.message || "Result added successfully.", "#22c55e");
        document.getElementById("resultMarks").value = "";
        document.getElementById("resultGrade").value = "";
        await loadStudents();
        renderDashboardStats();
    } catch (error) {
        console.error("ADD RESULT ERROR:", error);
        setMessage("resultMessage", "Server error. Try again.", "#ef4444");
    }
}

async function loadAttendance() {
    const tableBody = document.getElementById("attendanceTableBody");
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="4">Loading attendance...</td></tr>`;
    }

    try {
        const res = await fetch("/admin/attendance", {
            credentials: "include"
        });
        const data = await readJson(res);

        if (!res.ok) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="4">Unable to load attendance.</td></tr>`;
            }
            return;
        }

        attendanceRecords = Array.isArray(data.attendance) ? data.attendance : [];
        renderAttendanceTable();
    } catch (error) {
        console.error("LOAD ATTENDANCE ERROR:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="4">Server error loading attendance.</td></tr>`;
        }
    }
}

function renderAttendanceTable() {
    const tableBody = document.getElementById("attendanceTableBody");
    if (!tableBody) return;

    if (!attendanceRecords.length) {
        tableBody.innerHTML = `<tr><td colspan="4" style="color:#9ca3af;">No attendance records yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = attendanceRecords.map(record => `
        <tr>
            <td>${getValue(record, ["studentId", "student_id"], "-")}</td>
            <td>${new Date(getValue(record, ["date", "createdAt", "created_at"], Date.now())).toLocaleDateString()}</td>
            <td>${formatAttendanceStatus(Boolean(getValue(record, ["status"], false)))}</td>
            <td><button class="btn delete" onclick="deleteAttendance('${record.id}')">Remove</button></td>
        </tr>
    `).join("");
}

async function addAttendance() {
    const studentId = document.getElementById("attendanceStudentId").value.trim();
    const date = document.getElementById("attendanceDate").value;
    const status = document.getElementById("attendanceStatus").value === "true";

    if (!studentId || !date) {
        setMessage("attendanceMessage", "Student id, date, and status are required.", "#ef4444");
        return;
    }

    try {
        setMessage("attendanceMessage", "Saving attendance...", "#fbbf24");

        const res = await fetch("/admin/attendance", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ studentId, date, status })
        });

        const data = await readJson(res);
        if (!res.ok) {
            setMessage("attendanceMessage", data.message || "Unable to save attendance.", "#ef4444");
            return;
        }

        setMessage("attendanceMessage", data.message || "Attendance saved.", "#22c55e");
        document.getElementById("attendanceStudentId").value = "";
        document.getElementById("attendanceDate").value = "";
        document.getElementById("attendanceStatus").value = "true";
        await loadAttendance();
        renderDashboardStats();
    } catch (error) {
        console.error("ADD ATTENDANCE ERROR:", error);
        setMessage("attendanceMessage", "Server error. Try again.", "#ef4444");
    }
}

async function deleteAttendance(id) {
    try {
        const res = await fetch(`/admin/attendance/${id}`, {
            method: "DELETE",
            credentials: "include"
        });

        if (!res.ok) return;

        await loadAttendance();
        renderDashboardStats();
    } catch (error) {
        console.error("DELETE ATTENDANCE ERROR:", error);
    }
}

async function loadCourses() {
    const tableBody = document.getElementById("courseTableBody");
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="4">Loading courses...</td></tr>`;
    }

    try {
        const res = await fetch("/admin/courses", {
            credentials: "include"
        });
        const data = await readJson(res);

        if (!res.ok) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="4">Unable to load courses.</td></tr>`;
            }
            return;
        }

        courses = Array.isArray(data.courses) ? data.courses : [];
        renderCourseTable();
    } catch (error) {
        console.error("LOAD COURSES ERROR:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="4">Server error loading courses.</td></tr>`;
        }
    }
}

function renderCourseTable() {
    const tableBody = document.getElementById("courseTableBody");
    if (!tableBody) return;

    if (!courses.length) {
        tableBody.innerHTML = `<tr><td colspan="3" style="color:#9ca3af;">No courses uploaded yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = courses.map(course => `
        <tr>
            <td>${getValue(course, ["courseName", "course_name", "title", "name"], "-")}</td>
            <td>${new Date(getValue(course, ["createdAt", "created_at"], Date.now())).toLocaleDateString()}</td>
            <td><button class="btn delete" onclick="deleteCourse('${course.id}')">Remove</button></td>
        </tr>
    `).join("");
}

async function addCourse() {
    const courseName = document.getElementById("courseName").value.trim();

    if (!courseName) {
        setMessage("courseMessage", "Course name is required.", "#ef4444");
        return;
    }

    try {
        setMessage("courseMessage", "Saving course...", "#fbbf24");

        const res = await fetch("/admin/courses", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ courseName })
        });

        const data = await readJson(res);
        if (!res.ok) {
            setMessage("courseMessage", data.message || "Unable to save course.", "#ef4444");
            return;
        }

        setMessage("courseMessage", data.message || "Course saved successfully.", "#22c55e");
        document.getElementById("courseName").value = "";
        await loadCourses();
        renderDashboardStats();
    } catch (error) {
        console.error("ADD COURSE ERROR:", error);
        setMessage("courseMessage", "Server error. Try again.", "#ef4444");
    }
}

async function deleteCourse(id) {
    try {
        const res = await fetch(`/admin/courses/${id}`, {
            method: "DELETE",
            credentials: "include"
        });

        if (!res.ok) return;

        await loadCourses();
        renderDashboardStats();
    } catch (error) {
        console.error("DELETE COURSE ERROR:", error);
    }
}

async function loadMessages() {
    const tableBody = document.getElementById("messageTableBody");
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="4">Loading messages...</td></tr>`;
    }

    try {
        const res = await fetch("/admin/messages", {
            credentials: "include"
        });
        const data = await readJson(res);

        if (!res.ok) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="4">Unable to load messages.</td></tr>`;
            }
            return;
        }

        messages = Array.isArray(data.messages) ? data.messages : [];
        renderMessageTable();
    } catch (error) {
        console.error("LOAD MESSAGES ERROR:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="4">Server error loading messages.</td></tr>`;
        }
    }
}

function renderMessageTable() {
    const tableBody = document.getElementById("messageTableBody");
    if (!tableBody) return;

    if (!messages.length) {
        tableBody.innerHTML = `<tr><td colspan="4" style="color:#9ca3af;">No messages uploaded yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = messages.map(item => `
        <tr>
            <td>${getValue(item, ["username"], "Admin")}</td>
            <td>${getValue(item, ["content", "message"], "-")}</td>
            <td>${new Date(getValue(item, ["createdAt", "created_at", "date"], Date.now())).toLocaleDateString()}</td>
            <td><button class="btn delete" onclick="deleteMessageItem('${item.id}')">Remove</button></td>
        </tr>
    `).join("");
}

async function addMessageItem() {
    const title = document.getElementById("messageTitle").value.trim();
    const content = document.getElementById("messageContent").value.trim();

    if (!content) {
        setMessage("messageBoardStatus", "Message content is required.", "#ef4444");
        return;
    }

    try {
        setMessage("messageBoardStatus", "Publishing message...", "#fbbf24");

        const res = await fetch("/admin/messages", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ title, content })
        });

        const data = await readJson(res);
        if (!res.ok) {
            const errorText = [data.message, data.debug].filter(Boolean).join(" | ");
            setMessage("messageBoardStatus", errorText || "Unable to publish message.", "#ef4444");
            return;
        }

        setMessage("messageBoardStatus", data.message || "Message published successfully.", "#22c55e");
        document.getElementById("messageTitle").value = "";
        document.getElementById("messageContent").value = "";
        await loadMessages();
        renderDashboardStats();
    } catch (error) {
        console.error("ADD MESSAGE ERROR:", error);
        setMessage("messageBoardStatus", "Server error. Try again.", "#ef4444");
    }
}

async function deleteMessageItem(id) {
    try {
        const res = await fetch(`/admin/messages/${id}`, {
            method: "DELETE",
            credentials: "include"
        });

        if (!res.ok) return;

        await loadMessages();
        renderDashboardStats();
    } catch (error) {
        console.error("DELETE MESSAGE ERROR:", error);
    }
}

async function changeUserRole() {
    const email = document.getElementById("userEmail").value.trim().toLowerCase();
    const role = document.getElementById("userRole").value;

    if (!email) {
        setMessage("roleMessage", "Please enter the user email.", "#ef4444");
        return;
    }

    try {
        setMessage("roleMessage", "Updating role...", "#fbbf24");

        const res = await fetch("/admin/change-role", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({ email, role })
        });

        const data = await readJson(res);
        if (!res.ok) {
            setMessage("roleMessage", data.message || "Could not update role.", "#ef4444");
            return;
        }

        setMessage("roleMessage", data.message || "Role updated successfully.", "#22c55e");
        await loadStudents();
        renderDashboardStats();
    } catch (error) {
        console.error("CHANGE ROLE ERROR:", error);
        setMessage("roleMessage", "Server error. Try again.", "#ef4444");
    }
}

document.querySelector("header .refresh").addEventListener("click", async () => {
    await showSection(currentSection);
});

showSection("dashboard");
