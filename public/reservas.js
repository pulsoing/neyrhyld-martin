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
    onSnapshot,
    runTransaction,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentProfile = null;

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

        currentUser = user;

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            authStatus.textContent = "No encontramos tu perfil. Vuelve a iniciar sesión.";
            return;
        }

        currentProfile = userSnap.data();

        authStatus.textContent = `Bienvenido/a, ${user.displayName || user.email}`;

        if (reservasContent) {
            reservasContent.style.display = "block";
        }

        listenAvailableSlots();
        listenMyReservations(user.uid);
    });
});

function listenMyReservations(userId) {
    const list = document.getElementById("myReservationsList");

    if (!list) return;

    const myReservationsQuery = query(
        collection(db, "reservations"),
        where("userId", "==", userId)
    );

    onSnapshot(myReservationsQuery, (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = `
                <div class="empty-state compact">
                    <i class="fas fa-calendar-plus"></i>
                    <h2>Aún no tienes reservas</h2>
                    <p>Cuando reserves una hora, aparecerá en esta sección.</p>
                </div>
            `;
            return;
        }

        const reservations = [];

        snapshot.forEach((docSnap) => {
            reservations.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        reservations.sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return a.horaInicio.localeCompare(b.horaInicio);
        });

        const confirmed = reservations.filter(reservation => reservation.estado === "confirmada");
        const pendingCancellation = reservations.filter(reservation => reservation.estado === "solicitud_cancelacion");
        const cancelled = reservations.filter(reservation => reservation.estado === "cancelada");

        list.innerHTML = `
            <div class="my-reservations-group">
                <h3>Confirmadas</h3>
                <div id="myConfirmedReservations"></div>
            </div>

            <div class="my-reservations-group">
                <h3>Solicitudes de cancelación</h3>
                <div id="myPendingCancellationReservations"></div>
            </div>

            <div class="my-reservations-group">
                <h3>Canceladas / historial</h3>
                <div id="myCancelledReservations"></div>
            </div>
        `;

        renderMyReservationGroup(
            document.getElementById("myConfirmedReservations"),
            confirmed,
            "confirmada"
        );

        renderMyReservationGroup(
            document.getElementById("myPendingCancellationReservations"),
            pendingCancellation,
            "solicitud_cancelacion"
        );

        renderMyReservationGroup(
            document.getElementById("myCancelledReservations"),
            cancelled,
            "cancelada"
        );

    }, (error) => {
        console.error("Error leyendo mis reservas:", error);

        list.innerHTML = `
            <div class="empty-state compact">
                <i class="fas fa-exclamation-circle"></i>
                <h2>No se pudieron cargar tus reservas</h2>
                <p>Intenta nuevamente más tarde.</p>
            </div>
        `;
    });
}

function renderMyReservationGroup(container, reservations, status) {
    if (!container) return;

    const emptyLabels = {
        confirmada: "No hay reservas confirmadas.",
        solicitud_cancelacion: "No hay solicitudes de cancelación.",
        cancelada: "No hay reservas canceladas."
    };

    if (!reservations.length) {
        container.innerHTML = `<p class="muted-text">${emptyLabels[status]}</p>`;
        return;
    }

    container.innerHTML = "";

    reservations.forEach((reservation) => {
        const item = document.createElement("div");
        item.className = `my-reservation-card ${status}`;

        const statusLabel = getReservationStatusLabel(status);

        item.innerHTML = `
            <div>
                <span class="my-reservation-service">${reservation.servicio || "Servicio"}</span>
                <strong>${formatLongDate(reservation.fecha)}</strong>
                <p>${reservation.horaInicio} - ${reservation.horaFin}</p>
            </div>

            <div class="my-reservation-actions">
                <span class="my-reservation-status ${status}">
                    ${statusLabel}
                </span>

                ${status === "confirmada"
                ? `<button class="btn btn-secondary-dark request-cancel-btn" data-reservation-id="${reservation.id}">
                            Solicitar cancelar hora
                           </button>`
                : ""
            }
            </div>
        `;

        const requestCancelBtn = item.querySelector(".request-cancel-btn");

        if (requestCancelBtn) {
            requestCancelBtn.addEventListener("click", () => {
                requestCancellation(reservation.id);
            });
        }

        container.appendChild(item);
    });
}

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

        const today = toLocalDateString(new Date());
        const slotsByDate = {};

        snapshot.forEach((docSnap) => {
            const slot = {
                id: docSnap.id,
                ...docSnap.data()
            };

            if (slot.fecha < today) return;

            if (!slotsByDate[slot.fecha]) {
                slotsByDate[slot.fecha] = [];
            }

            slotsByDate[slot.fecha].push(slot);
        });

        const dates = Object.keys(slotsByDate).sort();

        if (!dates.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h2>No hay horas disponibles</h2>
                    <p>Las horas disponibles ya pasaron o no existen nuevos horarios cargados.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = "";

        dates.forEach((date) => {
            const group = document.createElement("section");
            group.className = "client-date-group";

            const sortedSlots = slotsByDate[date].sort((a, b) => {
                if (a.servicio !== b.servicio) {
                    return a.servicio.localeCompare(b.servicio);
                }

                return a.horaInicio.localeCompare(b.horaInicio);
            });

            group.innerHTML = `
                <div class="client-date-header">
                    <div>
                        <span class="client-date-kicker">${getFriendlyDateLabel(date)}</span>
                        <h2>${formatLongDate(date)}</h2>
                    </div>
                    <span class="client-date-count">${sortedSlots.length} hora(s)</span>
                </div>

                <div class="client-slots-grid"></div>
            `;

            const grid = group.querySelector(".client-slots-grid");

            sortedSlots.forEach((slot) => {
                const item = document.createElement("div");
                item.className = "client-slot-card";

                item.innerHTML = `
                    <div class="client-slot-main">
                        <span class="client-slot-service">${slot.servicio}</span>
                        <strong>${slot.horaInicio} - ${slot.horaFin}</strong>
                        <p>Hora disponible para reserva.</p>
                    </div>

                    <button class="btn btn-primary client-reserve-btn" data-slot-id="${slot.id}">
                        Reservar hora
                    </button>
                `;

                const reserveBtn = item.querySelector(".client-reserve-btn");
                reserveBtn.addEventListener("click", () => reserveSlot(slot.id));

                grid.appendChild(item);
            });

            list.appendChild(group);
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
async function reserveSlot(slotId) {
    if (!currentUser || !currentProfile) {
        alert("Debes iniciar sesión para reservar.");
        window.location.href = "login.html";
        return;
    }

    const confirmReservation = confirm("¿Confirmas que deseas reservar esta hora?");

    if (!confirmReservation) return;

    const slotRef = doc(db, "availability", slotId);
    const reservationRef = doc(collection(db, "reservations"));
    let reservationPayload = null;

    try {
        await runTransaction(db, async (transaction) => {
            const slotSnap = await transaction.get(slotRef);

            if (!slotSnap.exists()) {
                throw new Error("La hora seleccionada ya no existe.");
            }

            const slot = slotSnap.data();

            if (slot.estado !== "disponible") {
                throw new Error("Esta hora ya no está disponible.");
            }

            reservationPayload = {
                userId: currentUser.uid,
                userName: currentUser.displayName || currentProfile.nombre || "",
                userEmail: currentUser.email || currentProfile.email || "",
                userPhone: currentProfile.telefono || "",
                slotId,
                reservationId: reservationRef.id,
                fecha: slot.fecha,
                horaInicio: slot.horaInicio,
                horaFin: slot.horaFin,
                servicio: slot.servicio,
                estado: "confirmada"
            };

            transaction.set(reservationRef, {
                userId: currentUser.uid,
                userName: currentUser.displayName || currentProfile.nombre || "",
                userEmail: currentUser.email || currentProfile.email || "",
                userPhone: currentProfile.telefono || "",
                slotId,
                fecha: slot.fecha,
                horaInicio: slot.horaInicio,
                horaFin: slot.horaFin,
                servicio: slot.servicio,
                estado: "confirmada",
                reservationPayload,
                createdAt: serverTimestamp()
            });

            transaction.update(slotRef, {
                estado: "reservada",
                reservedBy: currentUser.uid,
                reservationId: reservationRef.id,
                reservedAt: serverTimestamp()
            });
        });

        await notifyReservation(reservationPayload);

        alert("✅ Hora reservada correctamente.");

    } catch (error) {
        console.error("Error reservando hora:", error);
        alert(`❌ No se pudo reservar la hora.\n\n${error.message}`);
    }
}

function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getFriendlyDateLabel(dateString) {
    const today = toLocalDateString(new Date());

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = toLocalDateString(tomorrow);

    if (dateString === today) return "Hoy";
    if (dateString === tomorrowString) return "Mañana";

    return "Próxima fecha";
}

function formatLongDate(dateString) {
    const [year, month, day] = dateString.split("-");
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    return date.toLocaleDateString("es-CL", {
        weekday: "long",
        day: "2-digit",
        month: "long"
    });
}

async function notifyReservation(reservationPayload) {
    if (!reservationPayload) return;

    try {
        const response = await fetch("/api/notificar-reserva", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userName: reservationPayload.userName,
                userEmail: reservationPayload.userEmail,
                userPhone: reservationPayload.userPhone,
                servicio: reservationPayload.servicio,
                fecha: reservationPayload.fecha,
                horaInicio: reservationPayload.horaInicio,
                horaFin: reservationPayload.horaFin,
                reservationId: reservationPayload.reservationId
            })
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            console.warn("La reserva fue creada, pero no se pudo enviar la notificación:", result);
        }

    } catch (error) {
        console.warn("La reserva fue creada, pero falló la notificación:", error);
    }
}

function getReservationStatusLabel(status) {
    const labels = {
        confirmada: "Confirmada",
        solicitud_cancelacion: "Solicitud enviada",
        cancelada: "Cancelada"
    };

    return labels[status] || status;
}

async function requestCancellation(reservationId) {
    const confirmRequest = confirm(
        "¿Deseas solicitar la cancelación de esta hora?\n\nLa reserva quedará pendiente hasta que administración confirme la cancelación."
    );

    if (!confirmRequest) return;

    const reservationRef = doc(db, "reservations", reservationId);

    try {
        await updateDoc(reservationRef, {
            estado: "solicitud_cancelacion",
            cancelRequestedAt: serverTimestamp(),
            cancelRequestedBy: currentUser.uid,
            cancelRequestedByEmail: currentUser.email
        });

        await notifyCancelRequest(reservationId);

        alert("✅ Solicitud de cancelación enviada correctamente.");

    } catch (error) {
        console.error("Error solicitando cancelación:", error);
        alert(`❌ No se pudo solicitar la cancelación.\n\n${error.message}`);
    }
}

async function notifyCancelRequest(reservationId) {
    try {
        const reservationRef = doc(db, "reservations", reservationId);
        const reservationSnap = await getDoc(reservationRef);

        if (!reservationSnap.exists()) {
            console.warn("No se encontró la reserva para notificar solicitud de cancelación.");
            return;
        }

        const reservation = reservationSnap.data();

        const response = await fetch("/api/notificar-solicitud-cancelacion", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userName: reservation.userName || currentUser.displayName || "Cliente",
                userEmail: reservation.userEmail || currentUser.email || "",
                userPhone: reservation.userPhone || currentProfile.telefono || "",
                servicio: reservation.servicio || "",
                fecha: reservation.fecha || "",
                horaInicio: reservation.horaInicio || "",
                horaFin: reservation.horaFin || "",
                reservationId
            })
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            console.warn("La solicitud fue registrada, pero no se pudo notificar al admin:", result);
        }

    } catch (error) {
        console.warn("La solicitud fue registrada, pero falló la notificación al admin:", error);
    }
}

