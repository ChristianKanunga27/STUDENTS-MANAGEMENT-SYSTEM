/* SIDEBAR */
function toggleSidebar(){
    document.getElementById("sidebar").classList.toggle("active");
    document.querySelector(".overlay").classList.toggle("active");
}

/* NAVIGATION */
function showSection(section){
    document.querySelectorAll(".section").forEach(s=>{
        s.style.display="none";
    });

    document.getElementById(section).style.display="block";
    document.getElementById("title").innerText = section.toUpperCase();

    if (section === "users" || section === "dashboard") {
        loadStudents();
    }

    if (section === "attendance") {
        loadAttendance();
    }

    if (section === "quiz") {
        loadQuiz();
    }
}

/* ADMIN DATA */
let adminStudents = [];
let attendanceRecords = [];
let quizItems = [];

async function loadStudents() {
    const tableBody = document.getElementById("studentTableBody");
    const studentCountEl = document.getElementById("studentCount");
    const adminCountEl = document.getElementById("adminCount");
    const averageScoreEl = document.getElementById("averageScore");

    tableBody.innerHTML = `<tr><td colspan="6">Loading students...</td></tr>`;
    studentCountEl.innerText = "Loading...";
    adminCountEl.innerText = "Loading...";
    averageScoreEl.innerText = "Loading...";

    try {
        const res = await fetch("/admin/students", {
            credentials: "include"
        });

        if (!res.ok) {
            tableBody.innerHTML = `<tr><td colspan="6">Unable to load students.</td></tr>`;
            return;
        }

        const data = await res.json();
        adminStudents = data.students || [];

        const totalStudents = adminStudents.length;
        const totalAdmins = adminStudents.filter(s => s.role === "admin").length;
        const marksList = adminStudents.flatMap(s => Array.isArray(s.marks) ? s.marks : []);
        const averageScore = marksList.length > 0
            ? Math.round(marksList.reduce((sum, mark) => sum + (Number(mark.score) || 0), 0) / marksList.length)
            : 0;

        studentCountEl.innerText = totalStudents;
        adminCountEl.innerText = totalAdmins;
        averageScoreEl.innerText = averageScore + "%";

        renderStudentTable();
    } catch (err) {
        console.error("LOAD STUDENTS ERROR:", err);
        tableBody.innerHTML = `<tr><td colspan="6">Server error loading students.</td></tr>`;
    }
}

function renderStudentTable() {
    const tableBody = document.getElementById("studentTableBody");

    if (adminStudents.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6">No students found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = adminStudents.map(student => {
        const marksCount = Array.isArray(student.marks) ? student.marks.length : 0;
        return `
            <tr>
                <td>${student.id}</td>
                <td>${student.username || "-"}</td>
                <td>${student.email || "-"}</td>
                <td>${student.role || "user"}</td>
                <td>${marksCount}</td>
                <td>
                    <button class="btn refresh" onclick="selectStudent('${student.id}')">Edit</button>
                    <button class="btn add" onclick="fillMarkStudent('${student.id}')">Add Mark</button>
                </td>
            </tr>
        `;
    }).join("");
}

function selectStudent(id) {
    const student = adminStudents.find(s => String(s.id) === String(id));
    if (!student) return;

    document.getElementById("editStudentId").value = student.id;
    document.getElementById("editUsername").value = student.username || "";
    document.getElementById("editEmail").value = student.email || "";
    document.getElementById("editRole").value = student.role || "user";
    document.getElementById("editStudentMessage").innerText = "";
}

function fillMarkStudent(id) {
    document.getElementById("markStudentId").value = id;
    document.getElementById("markMessage").innerText = "";
}

async function createStudent() {
    const username = document.getElementById("newUsername").value.trim();
    const email = document.getElementById("newEmail").value.trim();
    const password = document.getElementById("newPassword").value.trim();
    const role = document.getElementById("newRole").value;
    const message = document.getElementById("createStudentMessage");

    if (!username || !email || !password) {
        message.style.color = "#ef4444";
        message.innerText = "Username, email, and password are required.";
        return;
    }

    try {
        message.style.color = "#fbbf24";
        message.innerText = "Creating student...";

        const res = await fetch("/admin/students", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email, password, role })
        });

        const data = await res.json();
        if (!res.ok) {
            message.style.color = "#ef4444";
            message.innerText = data.message || "Unable to create student.";
            return;
        }

        message.style.color = "#22c55e";
        message.innerText = data.message || "Student created successfully.";
        document.getElementById("newUsername").value = "";
        document.getElementById("newEmail").value = "";
        document.getElementById("newPassword").value = "";
        document.getElementById("newRole").value = "user";
        loadStudents();
    } catch (err) {
        console.error("CREATE STUDENT ERROR:", err);
        message.style.color = "#ef4444";
        message.innerText = "Server error. Try again.";
    }
}

async function updateStudent() {
    const id = document.getElementById("editStudentId").value;
    const username = document.getElementById("editUsername").value.trim();
    const email = document.getElementById("editEmail").value.trim();
    const role = document.getElementById("editRole").value;
    const message = document.getElementById("editStudentMessage");

    if (!id || !username || !email) {
        message.style.color = "#ef4444";
        message.innerText = "Student id, username, and email are required.";
        return;
    }

    try {
        message.style.color = "#fbbf24";
        message.innerText = "Saving student...";

        const res = await fetch(`/admin/students/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email, role })
        });

        const data = await res.json();
        if (!res.ok) {
            message.style.color = "#ef4444";
            message.innerText = data.message || "Unable to save changes.";
            return;
        }

        message.style.color = "#22c55e";
        message.innerText = data.message || "Student updated successfully.";
        loadStudents();
    } catch (err) {
        console.error("UPDATE STUDENT ERROR:", err);
        message.style.color = "#ef4444";
        message.innerText = "Server error. Try again.";
    }
}

async function addStudentMark() {
    const id = document.getElementById("markStudentId").value.trim();
    const subject = document.getElementById("markSubject").value.trim();
    const score = document.getElementById("markScore").value;
    const maxScore = document.getElementById("markMaxScore").value;
    const message = document.getElementById("markMessage");

    if (!id || !subject || score === "" || maxScore === "") {
        message.style.color = "#ef4444";
        message.innerText = "Student id, subject, score and max score are required.";
        return;
    }

    try {
        message.style.color = "#fbbf24";
        message.innerText = "Adding new mark...";

        const res = await fetch(`/admin/students/${id}/marks`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ subject, score: Number(score), maxScore: Number(maxScore) })
        });

        const data = await res.json();
        if (!res.ok) {
            message.style.color = "#ef4444";
            message.innerText = data.message || "Unable to add mark.";
            return;
        }

        message.style.color = "#22c55e";
        message.innerText = data.message || "Mark added successfully.";
        loadStudents();
    } catch (err) {
        console.error("ADD MARK ERROR:", err);
        message.style.color = "#ef4444";
        message.innerText = "Server error. Try again.";
    }
}

function renderAttendanceTable() {
    const tableBody = document.getElementById("attendanceTableBody");

    if (attendanceRecords.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="color:#9ca3af;">No attendance records yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = attendanceRecords.map(record => `
        <tr>
            <td>${record.name}</td>
            <td>${new Date(record.date).toLocaleDateString()}</td>
            <td>${record.status}</td>
            <td><button class="btn delete" onclick="deleteAttendance('${record.id}')">Remove</button></td>
        </tr>
    `).join("");
}

async function loadAttendance() {
    const tableBody = document.getElementById("attendanceTableBody");
    tableBody.innerHTML = `<tr><td colspan="4">Loading attendance...</td></tr>`;

    try {
        const res = await fetch("/admin/attendance", {
            credentials: "include"
        });

        if (!res.ok) {
            tableBody.innerHTML = `<tr><td colspan="4">Unable to load attendance.</td></tr>`;
            return;
        }

        const data = await res.json();
        attendanceRecords = data.attendance || [];
        renderAttendanceTable();
    } catch (err) {
        console.error("LOAD ATTENDANCE ERROR:", err);
        tableBody.innerHTML = `<tr><td colspan="4">Server error loading attendance.</td></tr>`;
    }
}

async function addAttendance() {
    const name = document.getElementById("attendanceName").value.trim();
    const date = document.getElementById("attendanceDate").value;
    const status = document.getElementById("attendanceStatus").value;
    const message = document.getElementById("attendanceMessage");

    if (!name || !date || !status) {
        message.style.color = "#ef4444";
        message.innerText = "Name, date, and status are required.";
        return;
    }

    try {
        message.style.color = "#fbbf24";
        message.innerText = "Saving attendance...";

        const res = await fetch("/admin/attendance", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name, date, status })
        });

        const data = await res.json();
        if (!res.ok) {
            message.style.color = "#ef4444";
            message.innerText = data.message || "Unable to save attendance.";
            return;
        }

        message.style.color = "#22c55e";
        message.innerText = data.message || "Attendance saved.";
        document.getElementById("attendanceName").value = "";
        document.getElementById("attendanceDate").value = "";
        document.getElementById("attendanceStatus").value = "Present";
        loadAttendance();
    } catch (err) {
        console.error("ADD ATTENDANCE ERROR:", err);
        message.style.color = "#ef4444";
        message.innerText = "Server error. Try again.";
    }
}

async function deleteAttendance(id) {
    try {
        const res = await fetch(`/admin/attendance/${id}`, {
            method: "DELETE",
            credentials: "include"
        });

        if (!res.ok) {
            return;
        }

        loadAttendance();
    } catch (err) {
        console.error("DELETE ATTENDANCE ERROR:", err);
    }
}

function renderQuizTable() {
    const tableBody = document.getElementById("quizTableBody");

    if (quizItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="color:#9ca3af;">No quiz items yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = quizItems.map(item => `
        <tr>
            <td>${item.question}</td>
            <td>${item.optionA}</td>
            <td>${item.optionB}</td>
            <td>${item.answer}</td>
            <td><button class="btn delete" onclick="deleteQuizItem('${item.id}')">Remove</button></td>
        </tr>
    `).join("");
}

async function loadQuiz() {
    const tableBody = document.getElementById("quizTableBody");
    tableBody.innerHTML = `<tr><td colspan="5">Loading quiz...</td></tr>`;

    try {
        const res = await fetch("/admin/quiz", {
            credentials: "include"
        });

        if (!res.ok) {
            tableBody.innerHTML = `<tr><td colspan="5">Unable to load quiz items.</td></tr>`;
            return;
        }

        const data = await res.json();
        quizItems = data.quiz || [];
        renderQuizTable();
    } catch (err) {
        console.error("LOAD QUIZ ERROR:", err);
        tableBody.innerHTML = `<tr><td colspan="5">Server error loading quiz.</td></tr>`;
    }
}

async function addQuizItem() {
    const question = document.getElementById("quizQuestion").value.trim();
    const optionA = document.getElementById("quizOptionA").value.trim();
    const optionB = document.getElementById("quizOptionB").value.trim();
    const answer = document.getElementById("quizAnswer").value.trim();
    const message = document.getElementById("quizMessage");

    if (!question || !optionA || !optionB || !answer) {
        message.style.color = "#ef4444";
        message.innerText = "Question, options and answer are required.";
        return;
    }

    try {
        message.style.color = "#fbbf24";
        message.innerText = "Saving quiz item...";

        const res = await fetch("/admin/quiz", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question, optionA, optionB, answer })
        });

        const data = await res.json();
        if (!res.ok) {
            message.style.color = "#ef4444";
            message.innerText = data.message || "Unable to save quiz item.";
            return;
        }

        message.style.color = "#22c55e";
        message.innerText = data.message || "Quiz item saved.";
        document.getElementById("quizQuestion").value = "";
        document.getElementById("quizOptionA").value = "";
        document.getElementById("quizOptionB").value = "";
        document.getElementById("quizAnswer").value = "";
        loadQuiz();
    } catch (err) {
        console.error("ADD QUIZ ERROR:", err);
        message.style.color = "#ef4444";
        message.innerText = "Server error. Try again.";
    }
}

async function deleteQuizItem(id) {
    try {
        const res = await fetch(`/admin/quiz/${id}`, {
            method: "DELETE",
            credentials: "include"
        });

        if (!res.ok) {
            return;
        }

        loadQuiz();
    } catch (err) {
        console.error("DELETE QUIZ ERROR:", err);
    }
}

document.querySelector('header .refresh').addEventListener('click', () => {
    const current = document.getElementById("title").innerText.toLowerCase();
    if (current === "attendance") {
        loadAttendance();
    } else if (current === "quiz") {
        loadQuiz();
    } else {
        loadStudents();
    }
});

loadStudents();

async function changeUserRole() {
    const email = document.getElementById("userEmail").value.trim();
    const role = document.getElementById("userRole").value;
    const message = document.getElementById("roleMessage");

    if (!email) {
        message.style.color = "#ef4444";
        message.innerText = "Please enter the user email.";
        return;
    }

    try {
        message.style.color = "#fbbf24";
        message.innerText = "Updating role...";

        const res = await fetch("/admin/change-role", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({ email, role })
        });

        const data = await res.json();

        if (!res.ok) {
            message.style.color = "#ef4444";
            message.innerText = data.message || "Could not update role.";
            return;
        }

        message.style.color = "#22c55e";
        message.innerText = data.message || "Role updated successfully.";
    } catch (err) {
        console.error(err);
        message.style.color = "#ef4444";
        message.innerText = "Server error. Try again.";
    }
}
