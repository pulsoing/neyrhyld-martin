// =========================================================
// AUTH - NEYRHYLD MARTIN
// Login con Google + creación básica de usuario
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const ADMIN_EMAILS = [
    "pulsoing.cl@gmail.com"
];

document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById("loginGoogleBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const userBox = document.getElementById("userBox");
    const userName = document.getElementById("userName");
    const userEmail = document.getElementById("userEmail");
    const userRole = document.getElementById("userRole");
    const reservasBtn = document.getElementById("reservasBtn");
    const adminBtn = document.getElementById("adminBtn");

    if (loginBtn) {
        loginBtn.addEventListener("click", loginWithGoogle);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await signOut(auth);
            window.location.href = "login.html";
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            if (userBox) userBox.style.display = "none";
            if (loginBtn) loginBtn.style.display = "inline-flex";
            return;
        }

        const profile = await createOrUpdateUserProfile(user);

        if (loginBtn) loginBtn.style.display = "none";
        if (userBox) userBox.style.display = "block";

        if (userName) userName.textContent = user.displayName || "Usuario";
        if (userEmail) userEmail.textContent = user.email || "";
        if (userRole) userRole.textContent = profile.rol;

        if (reservasBtn) {
            reservasBtn.style.display = "inline-flex";
        }

        if (adminBtn && profile.rol === "admin") {
            adminBtn.style.display = "inline-flex";
        }
    });
});

async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        await createOrUpdateUserProfile(result.user);
    } catch (error) {
        console.error("Error login Google completo:", error);
        console.error("Código:", error.code);
        console.error("Mensaje:", error.message);

        alert(`No se pudo iniciar sesión con Google.\n\nCódigo: ${error.code || 'sin código'}\nMensaje: ${error.message || 'sin mensaje'}`);
    }
}

async function createOrUpdateUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const rol = ADMIN_EMAILS.includes(user.email) ? "admin" : "cliente";

    if (!userSnap.exists()) {
        const profile = {
            uid: user.uid,
            nombre: user.displayName || "",
            email: user.email || "",
            foto: user.photoURL || "",
            rol,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        await setDoc(userRef, profile);
        return profile;
    }

    const existingProfile = userSnap.data();

    const updatedProfile = {
        nombre: user.displayName || existingProfile.nombre || "",
        email: user.email || existingProfile.email || "",
        foto: user.photoURL || existingProfile.foto || "",
        rol: existingProfile.rol || rol,
        updatedAt: serverTimestamp()
    };

    await setDoc(userRef, updatedProfile, { merge: true });

    return {
        ...existingProfile,
        ...updatedProfile
    };
}