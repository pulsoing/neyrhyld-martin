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
let availabilitySlots = [];
let reservationsData = [];

const DASHBOARD_DAYS = 5;

const SERVICES = [
    "Cosmetología facial",
    "Estética corporal",
    "Masaje terapéutico",
    "Terapia complementaria",
    "Gift Card Spa",
    "Consulta general"
];

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
        listenAdminDashboard();
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

function listenAdminDashboard() {
    const availabilityQuery = query(
        collection(db, "availability"),
        orderBy("fecha", "asc"),
        orderBy("horaInicio", "asc")
    );

    onSnapshot(availabilityQuery, (snapshot) => {
        availabilitySlots = [];

        snapshot.forEach((docSnap) => {
            availabilitySlots.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        renderAdminDashboard();

    }, (error) => {
        console.error("Error leyendo disponibilidad:", error);

        const dashboard = document.getElementById("agendaDashboard");
        if (dashboard) {
            dashboard.innerHTML = "<p>No se pudo cargar la disponibilidad.</p>";
        }
    });

    const reservationsQuery = query(
        collection(db, "reservations"),
        orderBy("fecha", "asc"),
        orderBy("horaInicio", "asc")
    );

    onSnapshot(reservationsQuery, (snapshot) => {
        reservationsData = [];

        snapshot.forEach((docSnap) => {
            reservationsData.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        renderAdminDashboard();

    }, (error) => {
        console.error("Error leyendo reservas:", error);

        const cancelledList = document.getElementById("cancelledReservationsList");
        if (cancelledList) {
            cancelledList.innerHTML = "<p>No se pudieron cargar las reservas canceladas.</p>";
        }
    });
}

function renderAdminDashboard() {
    const summary = document.getElementById("adminSummary");
    const dashboard = document.getElementById("agendaDashboard");
    const cancelledList = document.getElementById("cancelledReservationsList");

    if (!summary || !dashboard || !cancelledList) return;

    const days = getNextDays(DASHBOARD_DAYS);
    const today = days[0].date;

    const futureSlots = availabilitySlots.filter(slot => slot.fecha >= today);

    const reservationsById = new Map(
        reservationsData.map(reservation => [reservation.id, reservation])
    );

    const availableCount = futureSlots.filter(slot => slot.estado === "disponible").length;
    const reservedCount = futureSlots.filter(slot => slot.estado === "reservada").length;
    const cancelledReservations = reservationsData.filter(reservation => reservation.estado === "cancelada");

    summary.innerHTML = `
        <div class="summary-grid">
            <div class="summary-card available">
                <span>${availableCount}</span>
                <p>Disponibles</p>
            </div>

            <div class="summary-card reserved">
                <span>${reservedCount}</span>
                <p>Reservadas</p>
            </div>

            <div class="summary-card cancelled">
                <span>${cancelledReservations.length}</span>
                <p>Canceladas</p>
            </div>
        </div>
    `;

    renderAgendaMatrix(dashboard, days, futureSlots, reservationsById);
    renderCancelledReservations(cancelledList, cancelledReservations);
}

function renderAgendaMatrix(container, days, slots, reservationsById) {
    let html = `
        <div class="agenda-grid" style="--agenda-days: ${days.length};">
            <div class="agenda-head service-head">Servicio</div>
    `;

    days.forEach(day => {
        html += `
            <div class="agenda-head">
                <strong>${day.label}</strong>
                <span>${formatDate(day.date)}</span>
            </div>
        `;
    });

    SERVICES.forEach(service => {
        html += `<div class="agenda-service">${service}</div>`;

        days.forEach(day => {
            const cellSlots = slots
                .filter(slot => slot.servicio === service && slot.fecha === day.date)
                .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

            html += `<div class="agenda-cell">`;

            if (!cellSlots.length) {
                html += `<span class="agenda-empty">—</span>`;
            }

            cellSlots.forEach(slot => {
                if (slot.estado === "reservada") {
                    const reservation = reservationsById.get(slot.reservationId);

                    const clientName = reservation?.userName || "Cliente no informado";
                    const clientEmail = reservation?.userEmail || "Email no informado";

                    html += `
                        <button 
                            class="agenda-chip reservada"
                            title="${escapeHtml(clientName)} - ${escapeHtml(clientEmail)}"
                            data-reservation-id="${slot.reservationId || ""}">
                            <span>${slot.horaInicio}</span>
                            <strong>R</strong>
                        </button>
                    `;
                } else {
                    html += `
                        <span class="agenda-chip disponible">
                            <span>${slot.horaInicio}</span>
                            <strong>D</strong>
                        </span>
                    `;
                }
            });

            html += `</div>`;
        });
    });

    html += `</div>`;

    container.innerHTML = html;

    container.querySelectorAll(".agenda-chip.reservada").forEach(button => {
        button.addEventListener("click", () => {
            const reservationId = button.dataset.reservationId;

            if (!reservationId) {
                alert("Esta reserva no tiene ID asociado.");
                return;
            }

            cancelReservation(reservationId);
        });
    });
}

function renderCancelledReservations(list, reservations) {
    if (!reservations.length) {
        list.innerHTML = "<p>No hay reservas canceladas.</p>";
        return;
    }

    list.innerHTML = "";

    reservations
        .sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return a.horaInicio.localeCompare(b.horaInicio);
        })
        .forEach((reservation) => {
            const item = document.createElement("div");
            item.className = "reservation-item cancelada";

            item.innerHTML = `
                <div>
                    <strong>${formatDate(reservation.fecha)}</strong>
                    <p>${reservation.horaInicio} - ${reservation.horaFin}</p>
                    <p><strong>Servicio:</strong> ${reservation.servicio}</p>
                    <p><strong>Cliente:</strong> ${reservation.userName || "No informado"}</p>
                    <p><strong>Email:</strong> ${reservation.userEmail || "No informado"}</p>
                    <p><strong>Estado:</strong> cancelada</p>
                </div>

                <div class="reservation-actions">
                    <span class="status-pill cancelled">Cancelada</span>
                </div>
            `;

            list.appendChild(item);
        });
}

function getNextDays(numberOfDays) {
    const days = [];
    const today = new Date();

    for (let i = 0; i < numberOfDays; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        days.push({
            date: toLocalDateString(date),
            label: i === 0 ? "Hoy" : i === 1 ? "Mañana" : `Día +${i}`
        });
    }

    return days;
}

function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

    let cancelledReservationPayload = null;

    try {
        await runTransaction(db, async (transaction) => {
            const reservationSnap = await transaction.get(reservationRef);

            if (!reservationSnap.exists()) {
                throw new Error("La reserva ya no existe.");
            }

            const reservation = reservationSnap.data();

            cancelledReservationPayload = {
                userName: reservation.userName || "Cliente",
                userEmail: reservation.userEmail || "",
                servicio: reservation.servicio || "",
                fecha: reservation.fecha || "",
                horaInicio: reservation.horaInicio || "",
                horaFin: reservation.horaFin || "",
                reservationId
            };

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

        await notifyCancellation(cancelledReservationPayload);

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

async function notifyCancellation(payload) {
    if (!payload || !payload.userEmail) return;

    try {
        const response = await fetch("/api/notificar-cancelacion", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            console.warn("La reserva fue cancelada, pero no se pudo notificar por correo:", result);
        }

    } catch (error) {
        console.warn("La reserva fue cancelada, pero falló la notificación:", error);
    }
}