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
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    onSnapshot,
    runTransaction,
    deleteField
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentAdminUser = null;

document.addEventListener("DOMContentLoaded", () => {
    const authStatus = document.getElementById("authStatus");
    const adminContent = document.getElementById("adminContent");

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            authStatus.textContent = "Debes iniciar sesión como administrador. Redirigiendo...";
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

        const profile = userSnap.data();

        if (profile.rol !== "admin") {
            authStatus.textContent = "No tienes permisos para acceder al panel administrativo.";
            setTimeout(() => {
                window.location.href = "reservas.html";
            }, 1800);
            return;
        }

        currentAdminUser = user;

        authStatus.textContent = `Administrador: ${user.displayName || user.email}`;
        adminContent.style.display = "block";

        initAvailabilityForm();
        listenAvailability();
        listenReservations();
    });
});

function initAvailabilityForm() {
    const form = document.getElementById("availabilityForm");
    const message = document.getElementById("availabilityMessage");

    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const fecha = document.getElementById("fecha").value;
        const horaInicio = document.getElementById("horaInicio").value;
        const horaFin = document.getElementById("horaFin").value;
        const servicio = document.getElementById("servicio").value;

        if (!fecha || !horaInicio || !horaFin || !servicio) {
            showMessage(message, "Completa todos los campos.", "error");
            return;
        }

        if (horaFin <= horaInicio) {
            showMessage(message, "La hora fin debe ser mayor que la hora inicio.", "error");
            return;
        }

        try {
            await addDoc(collection(db, "availability"), {
                fecha,
                horaInicio,
                horaFin,
                servicio,
                estado: "disponible",
                createdAt: serverTimestamp(),
                createdBy: currentAdminUser.uid,
                createdByEmail: currentAdminUser.email
            });

            form.reset();
            showMessage(message, "Hora disponible creada correctamente.", "success");

        } catch (error) {
            console.error("Error creando disponibilidad:", error);
            showMessage(message, "No se pudo crear la hora disponible.", "error");
        }
    });
}

function listenAvailability() {
    const list = document.getElementById("availabilityList");

    if (!list) return;

    const availabilityQuery = query(
        collection(db, "availability"),
        orderBy("fecha", "asc"),
        orderBy("horaInicio", "asc")
    );

    onSnapshot(availabilityQuery, (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = "<p>No hay horas disponibles creadas.</p>";
            return;
        }

        list.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const slot = docSnap.data();

            const item = document.createElement("div");
            item.className = `availability-item ${slot.estado}`;

            item.innerHTML = `
                <div>
                    <strong>${formatDate(slot.fecha)}</strong>
                    <p>${slot.horaInicio} - ${slot.horaFin}</p>
                    <p>${slot.servicio}</p>
                </div>
                <span class="status-pill">${slot.estado}</span>
            `;

            list.appendChild(item);
        });
    }, (error) => {
        console.error("Error leyendo disponibilidad:", error);
        list.innerHTML = "<p>No se pudieron cargar las horas disponibles.</p>";
    });
}

function listenReservations() {
    const list = document.getElementById("reservationsList");

    if (!list) return;

    const reservationsQuery = query(
        collection(db, "reservations"),
        orderBy("fecha", "asc"),
        orderBy("horaInicio", "asc")
    );

    onSnapshot(reservationsQuery, (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = "<p>No hay horas reservadas.</p>";
            return;
        }

        list.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const reservation = docSnap.data();

            const item = document.createElement("div");
            item.className = `reservation-item ${reservation.estado || "confirmada"}`;

            item.innerHTML = `
        <div>
            <strong>${formatDate(reservation.fecha)}</strong>
            <p>${reservation.horaInicio} - ${reservation.horaFin}</p>
            <p><strong>Servicio:</strong> ${reservation.servicio}</p>
            <p><strong>Cliente:</strong> ${reservation.userName || "No informado"}</p>
            <p><strong>Email:</strong> ${reservation.userEmail || "No informado"}</p>
            <p><strong>Estado:</strong> ${reservation.estado || "confirmada"}</p>
        </div>

        <div class="reservation-actions">
            <span class="status-pill reserved">${reservation.estado || "reservada"}</span>

            ${reservation.estado === "confirmada"
                    ? `<button class="btn btn-secondary-dark cancel-reservation-btn" data-reservation-id="${docSnap.id}">
                        Cancelar / liberar
                       </button>`
                    : ""
                }
        </div>
    `;

            const cancelBtn = item.querySelector(".cancel-reservation-btn");

            if (cancelBtn) {
                cancelBtn.addEventListener("click", () => {
                    cancelReservation(docSnap.id);
                });
            }

            list.appendChild(item);
        });

    }, (error) => {
        console.error("Error leyendo reservas:", error);
        list.innerHTML = "<p>No se pudieron cargar las reservas.</p>";
    });
}
function showMessage(element, text, type) {
    if (!element) return;

    element.textContent = text;
    element.className = `admin-message ${type}`;

    setTimeout(() => {
        element.textContent = "";
        element.className = "admin-message";
    }, 3500);
}

async function cancelReservation(reservationId) {
    const confirmCancel = confirm(
        "¿Confirmas que deseas cancelar esta reserva y liberar la hora?"
    );

    if (!confirmCancel) return;

    const reservationRef = doc(db, "reservations", reservationId);

    try {
        await runTransaction(db, async (transaction) => {
            const reservationSnap = await transaction.get(reservationRef);

            if (!reservationSnap.exists()) {
                throw new Error("La reserva ya no existe.");
            }

            const reservation = reservationSnap.data();

            if (reservation.estado !== "confirmada") {
                throw new Error("Esta reserva ya no está confirmada.");
            }

            if (!reservation.slotId) {
                throw new Error("La reserva no tiene una hora asociada.");
            }

            const slotRef = doc(db, "availability", reservation.slotId);
            const slotSnap = await transaction.get(slotRef);

            if (!slotSnap.exists()) {
                throw new Error("La hora asociada ya no existe.");
            }

            const slot = slotSnap.data();

            if (slot.estado !== "reservada") {
                throw new Error("La hora asociada no está marcada como reservada.");
            }

            transaction.update(reservationRef, {
                estado: "cancelada",
                cancelledAt: serverTimestamp(),
                cancelledBy: currentAdminUser.uid,
                cancelledByEmail: currentAdminUser.email
            });

            transaction.update(slotRef, {
                estado: "disponible",
                reservedBy: deleteField(),
                reservationId: deleteField(),
                reservedAt: deleteField()
            });
        });

        alert("✅ Reserva cancelada y hora liberada correctamente.");

    } catch (error) {
        console.error("Error cancelando reserva:", error);
        alert(`❌ No se pudo cancelar la reserva.\n\n${error.message}`);
    }
}

function formatDate(dateString) {
    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
}