const express = require('express');
const mqtt = require('mqtt');
const app = express();

app.use(express.json()); 

// =========================================================================
// CONFIGURACIÓN COMERCIAL DEFINITIVA
// =========================================================================
const MP_ACCESS_TOKEN = "APP_USR-7822915003661148-020412-fbfde71a25db8cc53e66bbd8b584d418-24535359";
const MQTT_BROKER_URL = "mqtt://broker.emqx.io"; 
const MQTT_TOPICO = "expendio01/bomba/activar";  

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on('connect', () => {
    console.log('✔ Servidor de producción en línea y conectado al Broker MQTT');
});

// =========================================================================
// WEBHOOK INTEGRAL (Soporta Simulación Developer y Pagos Reales con Centavos)
// =========================================================================
app.post('/webhook-mp', async (req, res) => {
    // Responder 200 OK de inmediato para que Mercado Pago Developer no tire error de timeout
    res.status(200).send("OK");

    const { action, type, data } = req.body;
    
    // CASO 1: VALIDACIÓN PARA MODO SIMULACIÓN DEVELOPER
    // Si Mercado Pago manda una alerta sin datos de ID reales o genéricos de testeo, forzamos un despacho de prueba
    if (req.body.id && !data) {
        console.log("\n🧪 [MODO SIMULADOR] Detectada prueba desde Mercado Pago Developer. Despachando 20 segundos...");
        mqttClient.publish(MQTT_TOPICO, "20", { qos: 1 });
        return;
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
        console.log(`\n🔔 Cobro detectado en el QR. ID de Transacción: ${paymentId}. Validando en servidores...`);

        try {
            // Consultar de forma segura a la API de Mercado Pago
            const response = await fetch(`https://mercadopago.com{paymentId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('No se pudo validar el pago en los servidores de MP');

            const paymentData = await response.json();

            if (paymentData.status === 'approved') {
                // Se limpian los decimales (.00) convirtiendo el monto a un número entero perfecto
                const monto = Math.round(paymentData.transaction_amount);
                let segundosBomba = 0;

                // Calibración comercial de tus 3 bidones de calle
                if (monto === 600)  segundosBomba = 20;  // Bidón de 5 Litros  -> 20 Segundos
                if (monto === 1200) segundosBomba = 40;  // Bidón de 10 Litros -> 40 Segundos
                if (monto === 2400) segundosBomba = 80;  // Bidón de 20 Litros -> 80 Segundos

                if (segundosBomba > 0) {
                    mqttClient.publish(MQTT_TOPICO, segundosBomba.toString(), { qos: 1 });
                    console.log("[DESPACHO COMERCIAL] Pago aprobado. Segundos enviados al ESP32: " + segundosBomba);
                } else {
                    console.log("[ALERTA VENDEDOR] Se recibio un cobro pero el importe no coincide.");
                }
            }
        } catch (error) {
            console.error('❌ Error de validación en la nube:', error.message);
        }
    }
});

// Puerto para la nube de Render
const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
   console.log("🚀 Servidor comercial operativo y listo en puerto " + PUERTO);
});
