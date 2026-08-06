// =========================================================================
// WEBHOOK INTEGRAL (Soporta Simulación Developer y Pagos Reales con Centavos)
// =========================================================================
app.post('/webhook-mp', async (req, res) => {
    // 1. LOG INMEDIATO: Ver qué está llegando exactamente desde Mercado Pago
    console.log("\n📬 [WEBHOOK RECIBIDO] Cuerpo de la petición:", JSON.stringify(req.body));

    const { action, type, data } = req.body;
    
    // CASO 1: VALIDACIÓN PARA MODO SIMULACIÓN DEVELOPER
    if (req.body.id && !data) {
        console.log("🧪 [MODO SIMULADOR] Detectada prueba desde Mercado Pago Developer. Despachando 20 segundos...");
        mqttClient.publish(MQTT_TOPICO, "20", { qos: 1 });
        return res.status(200).send("OK SIMULACION"); // Responder AQUÍ, al final del caso
    }

    // CASO 2: LOGICA DE PRODUCCIÓN PARA COMPRA REAL CON QR
    let paymentId = null;
    if (action === "payment.created" && data && data.id) {
        paymentId = data.id;
    } else if (type === "payment" && data && data.id) {
        paymentId = data.id;
    } else if (req.body.resource && req.body.topic === "payment") {
        const parts = req.body.resource.split('/');
        paymentId = parts[parts.length - 1];
    }

    if (paymentId) {
        console.log("🔔 Cobro detectado en el QR. ID de Transacción: " + paymentId + ". Validando en servidores...");

        try {
            // Consultar a la API de Mercado Pago
            const response = await fetch("https://api.mercadopago.com/v1/payments/" + paymentId, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + MP_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('No se pudo validar el pago en los servidores de MP');

            const paymentData = await response.json();

            if (paymentData.status === 'approved') {
                const monto = Math.round(paymentData.transaction_amount);
                let segundosBomba = 0;

                // Calibración comercial de tus 3 bidones de calle
                if (monto === 600)  segundosBomba = 20;  // Bidón de 5 Litros
                if (monto === 1200) segundosBomba = 40;  // Bidón de 10 Litros
                if (monto === 2400) segundosBomba = 80;  // Bidón de 20 Litros

                if (segundosBomba > 0) {
                    mqttClient.publish(MQTT_TOPICO, segundosBomba.toString(), { qos: 1 });
                    console.log("🚀 [DESPACHO COMERCIAL] Pago aprobado. Segundos enviados al ESP32: " + segundosBomba);
                } else {
                    console.log("⚠ [ALERTA VENDEDOR] Se recibió un cobro pero el importe (" + monto + ") no coincide con ningún bidón.");
                }
            } else {
                console.log("❌ [ESTADO] El pago no está aprobado. Estado actual: " + paymentData.status);
            }
        } catch (error) {
            console.error('❌ Error de validación en la nube: ' + error.message);
        }
    } else {
        console.log("ℹ Webhook recibido pero no contenía un ID de pago válido para procesar.");
    }

    // 2. RESPUESTA AL FINAL: Asegura que todo el código de arriba se ejecute antes de cerrar la petición
    return res.status(200).send("OK");
});
