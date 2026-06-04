import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", () => {
    const printBtn = document.getElementById("printGiftcardBtn");

    if (printBtn) {
        printBtn.addEventListener("click", () => {
            window.print();
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const isAdminUser = await validateAdmin(user);

        if (!isAdminUser) {
            document.getElementById("giftcardLoading").textContent =
                "No tienes permisos para ver esta Gift Card.";
            return;
        }

        await loadGiftcard();
    });
});

async function validateAdmin(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return false;

    const profile = userSnap.data();

    return profile.rol === "admin";
}

async function loadGiftcard() {
    const params = new URLSearchParams(window.location.search);
    const giftcardId = params.get("id");

    const loading = document.getElementById("giftcardLoading");
    const printable = document.getElementById("giftcardPrintable");
    const actions = document.getElementById("giftcardActions");

    if (!giftcardId) {
        loading.textContent = "No se indicó el ID de la Gift Card.";
        return;
    }

    try {
        const giftcardRef = doc(db, "giftcards", giftcardId);
        const giftcardSnap = await getDoc(giftcardRef);

        if (!giftcardSnap.exists()) {
            loading.textContent = "No se encontró la Gift Card.";
            return;
        }

        const giftcard = giftcardSnap.data();

        setText("gcParaNombre", giftcard.paraNombre);
        setText("gcRut", giftcard.rut);
        setText("gcCorreo", giftcard.correo);
        setText("gcValePor", giftcard.valePor);
        setText("gcMensaje", giftcard.mensaje || "Regala bienestar, calma y cuidado");
        setText("gcCode", giftcard.code);
        setText("gcFechaEmision", formatDate(giftcard.fechaEmision));
        setText("gcFechaVencimiento", giftcard.fechaVencimiento ? formatDate(giftcard.fechaVencimiento) : "Sin vencimiento");
        setText("gcEstado", getGiftcardStatusLabel(giftcard.estado));

        loading.style.display = "none";
        printable.style.display = "block";
        actions.style.display = "flex";

    } catch (error) {
        console.error("Error cargando Gift Card:", error);
        loading.textContent = "No se pudo cargar la Gift Card.";
    }
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (!element) return;

    element.textContent = value || "-";
}

function formatDate(dateString) {
    if (!dateString) return "-";

    const [year, month, day] = dateString.split("-");
    return `${day}-${month}-${year}`;
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