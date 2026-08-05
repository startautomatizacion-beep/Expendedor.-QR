const express = require('express');
const mqtt = require('mqtt');
const app = express();

app.use(express.json()); // Procesa los datos reales del QR impreso

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
// WEBHOOK PARA QR IMPRESO (Captura Órdenes y Pagos Reales)
// =========================================================================
app.post('/webhook-mp', async (req, res) => {
    // 1. Responder 200 OK de inmediato a Mercado Pago para confirmar recepción
    res.sendStatus(200);

    const { action, type, data } = req.body;
    
    // Detectar el ID del pago, ya sea que venga como payment o dentro de una merchant_order
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
        console.log(`\n🔔 Notificación de cobro recibida en QR Impreso. ID: ${paymentId}. Verificando...`);

        try {
            // 2. Consultar los detalles del pago de forma segura a la API de Mercado Pago
            const response = await fetch(`https://mercadopago.com{paymentId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('No se pudo validar el pago en las credenciales de MP');

            const paymentData = await response.json();

            // 3. Verificar que el estado impactado sea APROBADO
            if (paymentData.status === 'approved') {
                const monto = paymentData.transaction_amount;
                let segundosBomba = 0;

                // Calibración comercial de litros por precio:
                if (monto === 500)  segundosBomba = 20;  // 5 Litros -> 20 Segundos
                if (monto === 1000) segundosBomba = 40;  // 10 Litros -> 40 Segundos
                if (monto === 2000) segundosBomba = 80;  // 20 Litros -> 80 Segundos

                // 4. Si el monto coincide con un bidón, se envía la orden de despacho por MQTT
                if (segundosBomba > 0) {
                    mqttClient.publish(MQTT_TOPICO, segundosBomba.toString(), { qos: 1 });
                    console.log(`[DESPACHO REAL] ¡Monto de $${monto} aprobado! Pulso de ${segundosBomba}s enviado al ESP32.`);
                } else {
                    console.log(`[ALERTA] Se recibieron $${monto} en el QR, pero no coincide con los precios configurados.`);
                }
            }
        } catch (error) {
            console.error('❌ Error en el proceso de validación en la nube:', error.message);
        }
    }
});

// Iniciar el servicio para Render
const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
    console.log(`🚀 Servidor comercial listo para QR Impreso en puerto ${PUERTO}`);
});
