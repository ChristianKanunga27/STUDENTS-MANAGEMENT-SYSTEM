
// ===============================
// LOAD USERS
// ===============================
async function loadUsers() {
    const res = await fetch("http://localhost:3000/admin/users", {
        credentials: "include"
    });

    if (!res.ok) {
        alert("Access denied (Admin only)");
        window.location.href = "/login";
        return;
    }

    const users = await res.json();

    const table = document.getElementById("usersTable");

    table.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.provider || "local"}</td>
            <td>
                <span class="badge ${user.role === "admin" ? "admin" : "user"}">
                    ${user.role || "user"}
                </span>
            </td>
            <td>
                <button class="btn delete" onclick="deleteUser('${user.id}')">Delete</button>
                <button class="btn promote" onclick="promoteUser('${user.id}')">Promote</button>
            </td>
        </tr>
    `).join("");
}

// ===============================
// DELETE USER
// ===============================
async function deleteUser(id) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    const res = await fetch(`http://localhost:3000/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include"
    });

    if (res.ok) {
        alert("User deleted");
        loadUsers();
    } else {
        alert("Failed to delete user");
    }
}

// ===============================
// PROMOTE USER
// ===============================
async function promoteUser(id) {
    const res = await fetch(`http://localhost:3000/admin/promote/${id}`, {
        method: "PUT",
        credentials: "include"
    });

    if (res.ok) {
        alert("User promoted to admin");
        loadUsers();
    } else {
        alert("Failed to promote user");
    }
}

// INIT
loadUsers();
