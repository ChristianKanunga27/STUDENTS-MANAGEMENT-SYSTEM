
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
}

/* QUIZ ADD */
function addQuiz(){
    const table = document.getElementById("quizTable");

    table.innerHTML += `
        <tr>
            <td>New Question</td>
            <td>Option A</td>
            <td>Option B</td>
            <td>Answer</td>
            <td><button class="btn delete">Delete</button></td>
        </tr>
    `;
}
