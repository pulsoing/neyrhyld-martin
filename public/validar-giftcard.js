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
    getDocs,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentAdminUser = null;
let currentGiftcardDocId = null;
let currentGiftcardData = null;

document.addEventListener("DOMContentLoaded", () => {
    const authStatus = document.getElementById("validateGiftcardAuthStatus");
    const content = document.getElementById("validateGiftcardContent");

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
            authStatus.textContent = "No tienes permisos para validar Gift Cards.";
            setTimeout(() => {
                window.location.href = "reservas.html";
            }, 1800);
            return;
        }

        currentAdminUser = user;
        authStatus.textContent = `Administrador: ${user.displayName || user.email}`;
        content.style.display = "block";

        initValidatorForm();
        loadCodeFromUrl();
    });
});

function initValidatorForm() {
    const form = document.getElementById("validateGiftcardForm");

    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const code = document.getElementById("giftcardCodeInput").value.trim();

        if (!code) {
            showMessage("Ingresa un código para validar.", "error");
            return;
        }

        await searchGiftcardByCode(code);
    });
}

function loadCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) return;

    const input = document.getElementById("giftcardCodeInput");
    input.value = code;

    searchGiftcardByCode(code);
}

async function searchGiftcardByCode(code) {
    const result = document.getElementById("giftcardValidationResult");

    result.style.display = "none";
    result.innerHTML = "";
    showMessage("Buscando Gift Card...", "success");

    try {
        const normalizedCode = code.trim().toUpperCase();

        const giftcardsQuery = query(
            collection(db, "giftcards"),
            where("code", "==", normalizedCode)
        );

        const snapshot = await getDocs(giftcardsQuery);

        if (snapshot.empty) {
            currentGiftcardDocId = null;
            currentGiftcardData = null;

            showMessage("No se encontró una Gift Card con ese código.", "error");
            return;
        }

        const docSnap = snapshot.docs[0];

        currentGiftcardDocId = docSnap.id;
        currentGiftcardData = docSnap.data();

        showMessage("", "success");
        renderGiftcardResult(currentGiftcardDocId, currentGiftcardData);

    } catch (error) {
        console.error("Error validando Gift Card:", error);
        showMessage("No se pudo validar la Gift Card.", "error");
    }
}

function renderGiftcardResult(docId, giftcard) {
    const result = document.getElementById("giftcardValidationResult");

    const status = giftcard.estado || "sin_estado";
    const statusLabel = getGiftcardStatusLabel(status);

    const canUse = status === "activa";

    result.innerHTML = `
        <div class="admin-section giftcard-result-card ${status}">
            <div class="giftcard-result-header">
                <div>
                    <p class="section-kicker">Resultado</p>
                    <h2>${statusLabel}</h2>
                </div>

                <span class="giftcard-status-pill ${status}">
                    ${statusLabel}
                </span>
            </div>

            <div class="giftcard-result-grid">
                <div>
                    <span>Código</span>
                    <strong>${escapeHtml(giftcard.code)}</strong>
                </div>

                <div>
                    <span>Para</span>
                    <strong>${escapeHtml(giftcard.paraNombre)}</strong>
                </div>

                <div>
                    <span>RUT</span>
                    <strong>${escapeHtml(giftcard.rut)}</strong>
                </div>

                <div>
                    <span>Correo</span>
                    <strong>${escapeHtml(giftcard.correo)}</strong>
                </div>

                <div>
                    <span>Vale por</span>
                    <strong>${escapeHtml(giftcard.valePor)}</strong>
                </div>

                <div>
                    <span>Emisión</span>
                    <strong>${formatDate(giftcard.fechaEmision)}</strong>
                </div>

                <div>
                    <span>Vencimiento</span>
                    <strong>${giftcard.fechaVencimiento ? formatDate(giftcard.fechaVencimiento) : "Sin vencimiento"}</strong>
                </div>

                <div>
                    <span>Estado</span>
                    <strong>${statusLabel}</strong>
                </div>
            </div>

            <div class="giftcard-result-actions">
                <a class="btn btn-secondary-dark" href="giftcard.html?id=${docId}" target="_blank">
                    Ver / Imprimir
                </a>

                ${canUse
            ? `<button id="markGiftcardUsedBtn" class="btn btn-primary">
                            Marcar como usada
                           </button>`
            : ""
        }
            </div>
        </div>
    `;

    result.style.display = "block";

    const markUsedBtn = document.getElementById("markGiftcardUsedBtn");

    if (markUsedBtn) {
        markUsedBtn.addEventListener("click", () => {
            markGiftcardAsUsed(docId);
        });
    }
}

async function markGiftcardAsUsed(docId) {
    if (!currentGiftcardData) {
        showMessage("No hay Gift Card seleccionada.", "error");
        return;
    }

    if (currentGiftcardData.estado !== "activa") {
        showMessage("Esta Gift Card no está activa.", "error");
        return;
    }

    const confirmUse = confirm(
        "¿Confirmas que deseas marcar esta Gift Card como usada?\n\nEsta acción deja registro del canje."
    );

    if (!confirmUse) return;

    try {
        const giftcardRef = doc(db, "giftcards", docId);

        await updateDoc(giftcardRef, {
            estado: "usada",
            redeemedAt: serverTimestamp(),
            redeemedBy: currentAdminUser.uid,
            redeemedByEmail: currentAdminUser.email
        });

        showMessage("Gift Card marcada como usada correctamente.", "success");

        await searchGiftcardByCode(currentGiftcardData.code);

    } catch (error) {
        console.error("Error marcando Gift Card como usada:", error);
        showMessage("No se pudo marcar la Gift Card como usada.", "error");
    }
}

function showMessage(text, type) {
    const message = document.getElementById("validateGiftcardMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `admin-message ${type}`;
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

function formatDate(dateString) {
    if (!dateString) return "-";

    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}