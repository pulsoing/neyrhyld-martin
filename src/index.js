export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/api/contacto" && request.method === "POST") {
            return handleContacto(request, env);
        }

        if (url.pathname.startsWith("/api/")) {
            return jsonResponse({
                ok: false,
                message: "Endpoint no encontrado."
            }, 404);
        }

        return env.ASSETS.fetch(request);
    }
};

async function handleContacto(request, env) {
    try {
        const body = await request.json();

        const {
            nombre,
            email,
            telefono,
            servicio,
            mensaje,
            turnstileToken
        } = body;

        if (!nombre || !email || !servicio || !mensaje || !turnstileToken) {
            return jsonResponse({
                ok: false,
                message: "Faltan campos obligatorios."
            }, 400);
        }

        const turnstileValid = await validateTurnstile(
            turnstileToken,
            env.TURNSTILE_SECRET_KEY
        );

        if (!turnstileValid) {
            return jsonResponse({
                ok: false,
                message: "No se pudo validar la verificación de seguridad."
            }, 403);
        }

        const emailResult = await sendEmailWithResend({
            resendApiKey: env.RESEND_API_KEY,
            fromEmail: env.FROM_EMAIL,
            toEmail: env.TO_EMAIL,
            nombre,
            email,
            telefono,
            servicio,
            mensaje
        });

        if (!emailResult.ok) {
            return jsonResponse({
                ok: false,
                message: "No se pudo enviar el correo."
            }, 500);
        }

        return jsonResponse({
            ok: true,
            message: "Consulta enviada correctamente."
        });

    } catch (error) {
        console.error("Error en /api/contacto:", error);

        return jsonResponse({
            ok: false,
            message: "Error interno al procesar la consulta."
        }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

async function validateTurnstile(token, secretKey) {
    if (!secretKey) {
        console.error("TURNSTILE_SECRET_KEY no está configurada.");
        return false;
    }

    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData
    });

    const result = await response.json();

    if (!result.success) {
        console.error("Turnstile inválido:", result);
    }

    return result.success === true;
}

async function sendEmailWithResend({
    resendApiKey,
    fromEmail,
    toEmail,
    nombre,
    email,
    telefono,
    servicio,
    mensaje
}) {
    if (!resendApiKey || !fromEmail || !toEmail) {
        console.error("Faltan variables de entorno para Resend.");
        return { ok: false };
    }

    const subject = `Nueva consulta web - ${servicio}`;

    const html = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <h2>Nueva consulta desde la web Neyrhyld Martin</h2>

            <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Teléfono:</strong> ${escapeHtml(telefono || "No informado")}</p>
            <p><strong>Servicio:</strong> ${escapeHtml(servicio)}</p>

            <hr>

            <p><strong>Mensaje:</strong></p>
            <p>${escapeHtml(mensaje).replace(/\n/g, "<br>")}</p>
        </div>
    `;

    const text = `
Nueva consulta desde la web Neyrhyld Martin

Nombre: ${nombre}
Email: ${email}
Teléfono: ${telefono || "No informado"}
Servicio: ${servicio}

Mensaje:
${mensaje}
    `;

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [toEmail],
            reply_to: email,
            subject,
            html,
            text
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Error Resend:", errorText);
        return { ok: false };
    }

    return { ok: true };
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}