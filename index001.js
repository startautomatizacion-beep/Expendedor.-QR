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
    res.sendStatus(200); // Responder 200 OK de inmediato a Mercado Pago

    const { action, type, data } = req.body;
    let paymentId = null;
    
    // Detectar el ID del pago en cualquiera de los formatos de Mercado Pago
    if (action === "payment.created" && data && data.id) {
        paymentId = data.id;
    } else if (type === "payment" && data && data.id) {
        paymentId = data.id;
    } else if (req.body.resource && req.body.topic === "payment") {
        const parts = req.body.resource.split('/');
        paymentId = parts[parts.length - 1];
    }

    if (paymentId) {
        console.log(`\n🔔 Cobro detectado en el QR. ID de Transacción: ${paymentId}. Validando...`);

        try {
            // Consultar los detalles del pago a la API de Mercado Pago
            const response = await fetch(`https://mercadopago.com{paymentId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('No se pudo validar el pago en MP');

            const paymentData = await response.json();

            if (paymentData.status === 'approved') {
                // SOLUCIÓN DE DECIMALES: Redondea "600.00" a 600 de forma automática y segura
                const monto = Math.round(paymentData.transaction_amount);
                let segundosBomba = 0;

                // NUEVA CALIBRACIÓN DE TUS BIDONES COMERCIALES
                if (monto === 600)  segundosBomba = 20;  // Bidón de 5 Litros  -> 20 Segundos
                if (monto === 1200) segundosBomba = 40;  // Bidón de 10 Litros -> 40 Segundos
                if (monto === 2400) segundosBomba = 80;  // Bidón de 20 Litros -> 80 Segundos

                if (segundosBomba > 0) {
                    mqttClient.publish(MQTT_TOPICO, segundosBomba.toString(), { qos: 1 });
                    console.log(`[DESPACHO COMERCIAL] ¡Monto de $${monto} aprobado! Pulso de ${segundosBomba}s enviado al ESP32.`);
                } else {
                    console.log(`[ALERTA VENDEDOR] Se cobraron $${monto}, pero ese importe no está configurado en los bidones.`);
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
    console.log(`🚀 Servidor comercial listo para QR Impreso en puerto ${PUERTO}`);
});
