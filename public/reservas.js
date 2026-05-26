import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", () => {
    const authStatus = document.getElementById("authStatus");
    const reservasContent = document.getElementById("reservasContent");

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            authStatus.textContent = "Debes iniciar sesión para ver las reservas. Redirigiendo...";
            setTimeout(() => {
                window.location.href = "login.html";
            }, 1200);
            return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            authStatus.textContent = "No encontramos tu perfil. Vuelve a iniciar sesión.";
            return;
        }

        authStatus.textContent = `Bienvenido/a, ${user.displayName || user.email}`;
        reservasContent.style.display = "block";

        listenAvailableSlots();
    });
});

function listenAvailableSlots() {
    const list = document.getElementById("availableSlotsList");

    if (!list) return;

    const slotsQuery = query(
        collection(db, "availability"),
        where("estado", "==", "disponible"),
        orderBy("fecha", "asc"),
        orderBy("horaInicio", "asc")
    );

    onSnapshot(slotsQuery, (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h2>No hay horas disponibles</h2>
                    <p>Por ahora no existen horarios disponibles para reservar.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const slot = docSnap.data();

            const item = document.createElement("div");
            item.className = "available-slot-card";

            item.innerHTML = `
                <div class="slot-date">
                    <span class="slot-day">${formatDate(slot.fecha)}</span>
                    <span class="slot-time">${slot.horaInicio} - ${slot.horaFin}</span>
                </div>

                <div class="slot-info">
                    <h3>${slot.servicio}</h3>
                    <p>Hora disponible para reserva.</p>
                </div>

                <button class="btn btn-secondary-dark slot-btn" disabled>
                    Reservar próximamente
                </button>
            `;

            list.appendChild(item);
        });
    }, (error) => {
        console.error("Error leyendo horas disponibles:", error);

        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h2>No se pudieron cargar las horas</h2>
                <p>Intenta nuevamente más tarde.</p>
            </div>
        `;
    });
}

function formatDate(dateString) {
    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
}