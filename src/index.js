export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/api/contacto" && request.method === "POST") {
            return handleContacto(request, env);
        }

        if (url.pathname === "/api/notificar-reserva" && request.method === "POST") {
            return handleNotificarReserva(request, env);
        }

        if (url.pathname === "/api/notificar-cancelacion" && request.method === "POST") {
            return handleNotificarCancelacion(request, env);
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

        const turnstileResult = await validateTurnstile(
            turnstileToken,
            env.TURNSTILE_SECRET_KEY
        );

        if (!turnstileResult.success) {
            return jsonResponse({
                ok: false,
                message: "No se pudo validar la verificación de seguridad.",
                detail: turnstileResult
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
                message: "No se pudo enviar el correo.",
                detail: emailResult.error || "Sin detalle"
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

async function handleNotificarCancelacion(request, env) {
    try {
        const body = await request.json();

        const {
            userName,
            userEmail,
            servicio,
            fecha,
            horaInicio,
            horaFin,
            reservationId
        } = body;

        if (!userName || !userEmail || !servicio || !fecha || !horaInicio || !horaFin || !reservationId) {
            return jsonResponse({
                ok: false,
                message: "Faltan datos obligatorios para notificar cancelación."
            }, 400);
        }

        const emailResult = await sendCancellationEmailWithResend({
            resendApiKey: env.RESEND_API_KEY,
            fromEmail: env.FROM_EMAIL,
            toEmail: userEmail,
            ccEmail: env.TO_EMAIL,
            userName,
            userEmail,
            servicio,
            fecha,
            horaInicio,
            horaFin,
            reservationId
        });

        if (!emailResult.ok) {
            return jsonResponse({
                ok: false,
                message: "No se pudo enviar la notificación de cancelación.",
                detail: emailResult.error || "Sin detalle"
            }, 500);
        }

        return jsonResponse({
            ok: true,
            message: "Notificación de cancelación enviada correctamente."
        });

    } catch (error) {
        console.error("Error en /api/notificar-cancelacion:", error);

        return jsonResponse({
            ok: false,
            message: "Error interno al notificar cancelación."
        }, 500);
    }
}

async function sendCancellationEmailWithResend({
    resendApiKey,
    fromEmail,
    toEmail,
    ccEmail,
    userName,
    servicio,
    fecha,
    horaInicio,
    horaFin,
    reservationId
}) {
    const subject = `Reserva cancelada - ${servicio}`;
    const fechaFormateada = formatDateForEmail(fecha);

    const html = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <h2>Reserva cancelada</h2>

            <p>Hola ${escapeHtml(userName)},</p>

            <p>Te informamos que la siguiente reserva fue cancelada por administración:</p>

            <hr>

            <p><strong>Servicio:</strong> ${escapeHtml(servicio)}</p>
            <p><strong>Fecha:</strong> ${escapeHtml(fechaFormateada)}</p>
            <p><strong>Horario:</strong> ${escapeHtml(horaInicio)} - ${escapeHtml(horaFin)}</p>
            <p><strong>ID Reserva:</strong> ${escapeHtml(reservationId)}</p>

            <hr>

            <p>Para coordinar una nueva hora, puedes realizarlo de nuevo en la página o contactar directamente a Neyrhyld Martin.</p>
        </div>
    `;

    const text = `
Reserva cancelada

Hola ${userName},

Tu reserva fue cancelada por administración.

Servicio: ${servicio}
Fecha: ${fechaFormateada}
Horario: ${horaInicio} - ${horaFin}
ID Reserva: ${reservationId}

Para coordinar una nueva hora, puedes realizarlo de nuevo en la página o contactar directamente a Neyrhyld Martin.
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
            cc: ccEmail ? [ccEmail] : undefined,
            reply_to: ccEmail,
            subject,
            html,
            text
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Error Resend cancelación:", errorText);
        return { ok: false, error: errorText };
    }

    return { ok: true };
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
        return {
            success: false,
            errorCodes: ["missing-secret-key"]
        };
    }

    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData
    });

    const result = await response.json();

    console.log("Resultado Turnstile:", JSON.stringify(result));

    return {
        success: result.success === true,
        errorCodes: result["error-codes"] || [],
        hostname: result.hostname || null,
        action: result.action || null
    };
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
        return { ok: false, error: errorText };
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

async function handleNotificarReserva(request, env) {
    try {
        const origin = request.headers.get("Origin") || "";

        const allowedOrigins = [
            "https://neyrhyldmartin.pulsoing.cl",
            "https://neyrhyld-martin.pulsoing-cl.workers.dev"
        ];

        if (origin && !allowedOrigins.includes(origin)) {
            return jsonResponse({
                ok: false,
                message: "Origen no autorizado."
            }, 403);
        }

        const body = await request.json();

        const {
            userName,
            userEmail,
            userPhone,
            servicio,
            fecha,
            horaInicio,
            horaFin,
            reservationId
        } = body;

        if (!userName || !userEmail || !servicio || !fecha || !horaInicio || !horaFin || !reservationId) {
            return jsonResponse({
                ok: false,
                message: "Faltan datos obligatorios para notificar la reserva."
            }, 400);
        }

        const emailResult = await sendReservationEmailWithResend({
            resendApiKey: env.RESEND_API_KEY,
            fromEmail: env.FROM_EMAIL,
            toEmail: env.TO_EMAIL,
            userName,
            userEmail,
            userPhone,
            servicio,
            fecha,
            horaInicio,
            horaFin,
            reservationId
        });

        if (!emailResult.ok) {
            return jsonResponse({
                ok: false,
                message: "No se pudo enviar la notificación de reserva.",
                detail: emailResult.error || "Sin detalle"
            }, 500);
        }

        return jsonResponse({
            ok: true,
            message: "Notificación enviada correctamente."
        });

    } catch (error) {
        console.error("Error en /api/notificar-reserva:", error);

        return jsonResponse({
            ok: false,
            message: "Error interno al notificar reserva."
        }, 500);
    }
}

async function sendReservationEmailWithResend({
    resendApiKey,
    fromEmail,
    toEmail,
    userName,
    userEmail,
    userPhone,
    servicio,
    fecha,
    horaInicio,
    horaFin,
    reservationId
}) {
    if (!resendApiKey || !fromEmail || !toEmail) {
        console.error("Faltan variables de entorno para Resend.");
        return { ok: false, error: "Faltan variables de entorno." };
    }

    const subject = `Nueva reserva confirmada - ${servicio}`;

    const fechaFormateada = formatDateForEmail(fecha);

    const html = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <h2>Nueva reserva confirmada</h2>

            <p>Se ha registrado una nueva reserva desde la web de Neyrhyld Martin.</p>

            <hr>

            <p><strong>Cliente:</strong> ${escapeHtml(userName)}</p>
            <p><strong>Email:</strong> ${escapeHtml(userEmail)}</p>
            <p><strong>Teléfono:</strong> ${escapeHtml(userPhone || "No informado")}</p>

            <hr>

            <p><strong>Servicio:</strong> ${escapeHtml(servicio)}</p>
            <p><strong>Fecha:</strong> ${escapeHtml(fechaFormateada)}</p>
            <p><strong>Horario:</strong> ${escapeHtml(horaInicio)} - ${escapeHtml(horaFin)}</p>
            <p><strong>ID Reserva:</strong> ${escapeHtml(reservationId)}</p>
        </div>
    `;

    const text = `
Nueva reserva confirmada

Cliente: ${userName}
Email: ${userEmail}
Teléfono: ${userPhone || "No informado"}

Servicio: ${servicio}
Fecha: ${fechaFormateada}
Horario: ${horaInicio} - ${horaFin}
ID Reserva: ${reservationId}
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
            reply_to: userEmail,
            subject,
            html,
            text
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Error Resend notificación reserva:", errorText);
        return { ok: false, error: errorText };
    }

    return { ok: true };
}

function formatDateForEmail(dateString) {
    const [year, month, day] = dateString.split("-");
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    return date.toLocaleDateString("es-CL", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}