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
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentAdminUser = null;

document.addEventListener("DOMContentLoaded", () => {
    const authStatus = document.getElementById("giftcardAuthStatus");
    const content = document.getElementById("giftcardAdminContent");

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
            authStatus.textContent = "No tienes permisos para acceder a Gift Cards.";
            setTimeout(() => {
                window.location.href = "reservas.html";
            }, 1800);
            return;
        }

        currentAdminUser = user;
        authStatus.textContent = `Administrador: ${user.displayName || user.email}`;
        content.style.display = "block";

        initGiftcardForm();
        listenGiftcards();
    });
});

function initGiftcardForm() {
    const form = document.getElementById("giftcardForm");
    const message = document.getElementById("giftcardMessage");

    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const paraNombre = document.getElementById("paraNombre").value.trim();
        const rut = document.getElementById("rut").value.trim();
        const correo = document.getElementById("correo").value.trim();
        const valePor = document.getElementById("valePor").value;
        const mensaje = document.getElementById("mensaje").value.trim();
        const fechaVencimiento = document.getElementById("fechaVencimiento").value;

        if (!paraNombre || !rut || !correo || !valePor) {
            showMessage(message, "Completa los campos obligatorios.", "error");
            return;
        }

        const code = generateGiftcardCode();
        const fechaEmision = toLocalDateString(new Date());

        try {
            const giftcardRef = await addDoc(collection(db, "giftcards"), {
                code,
                paraNombre,
                rut,
                correo,
                valePor,
                mensaje: mensaje || "Regala bienestar, calma y cuidado",
                fechaEmision,
                fechaVencimiento: fechaVencimiento || "",
                estado: "activa",
                createdAt: serverTimestamp(),
                createdBy: currentAdminUser.uid,
                createdByEmail: currentAdminUser.email
            });

            form.reset();

            showMessage(
                message,
                `Gift Card generada correctamente. Código: ${code}`,
                "success"
            );

            setTimeout(() => {
                window.open(`giftcard.html?id=${giftcardRef.id}`, "_blank");
            }, 700);

        } catch (error) {
            console.error("Error creando gift card:", error);
            showMessage(message, "No se pudo generar la Gift Card.", "error");
        }
    });
}

function listenGiftcards() {
    const list = document.getElementById("giftcardsList");

    if (!list) return;

    const giftcardsQuery = query(
        collection(db, "giftcards"),
        orderBy("createdAt", "desc")
    );

    onSnapshot(giftcardsQuery, (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = "<p>No hay gift cards generadas.</p>";
            return;
        }

        list.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const giftcard = docSnap.data();

            const item = document.createElement("div");
            item.className = `giftcard-admin-item ${giftcard.estado}`;

            item.innerHTML = `
                <div>
                    <strong>${giftcard.code}</strong>
                    <p><strong>Para:</strong> ${escapeHtml(giftcard.paraNombre)}</p>
                    <p><strong>Vale por:</strong> ${escapeHtml(giftcard.valePor)}</p>
                    <p><strong>Estado:</strong> ${getGiftcardStatusLabel(giftcard.estado)}</p>
                </div>

                <div class="giftcard-admin-actions">
                    <a class="btn btn-secondary-dark" href="giftcard.html?id=${docSnap.id}" target="_blank">
                        Ver / Imprimir
                    </a>
                </div>
            `;

            list.appendChild(item);
        });

    }, (error) => {
        console.error("Error leyendo gift cards:", error);
        list.innerHTML = "<p>No se pudieron cargar las gift cards.</p>";
    });
}

function generateGiftcardCode() {
    const prefix = "NM-GC";
    const date = toLocalDateString(new Date()).replaceAll("-", "");
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `${prefix}-${date}-${random}`;
}

function getGiftcardStatusLabel(status) {
    const labels = {
        activa: "Activa",
        usada: "Usada",
        anulada: "Anulada",
        vencida: "Vencida"
    };

    return labels[status] || status || "Sin estado";
}

function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function showMessage(element, text, type) {
    if (!element) return;

    element.textContent = text;
    element.className = `admin-message ${type}`;

    setTimeout(() => {
        element.textContent = "";
        element.className = "admin-message";
    }, 4500);
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}