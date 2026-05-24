export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/api/contacto" && request.method === "POST") {
            return new Response(JSON.stringify({
                ok: true,
                message: "API contacto activa"
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json"
                }
            });
        }

        return env.ASSETS.fetch(request);
    }
};