const express = require('express');
const mqtt = require('mqtt');
const app = express();

app.use(express.json()); 

// Parche obligatorio para saltar la advertencia de ngrok
app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

// ===================================================
// CONFIGURACIÓN TÉCNICA
// ===================================================
const MP_ACCESS_TOKEN = "APP_USR-7822915003661148-020412-fbfde71a25db8cc53e66bbd8b584d418-24535359";
const MQTT_BROKER_URL = "mqtt://broker.emqx.io"; 
const MQTT_TOPICO = "expendio01/bomba/activar";

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on('connect', () => {
    console.log('✔ Servidor intermedio conectado exitosamente a MQTT Broker (EMQX)');
});

// ===================================================
// ENDPOINT DEL WEBHOOK MODIFICADO PARA PRUEBAS
// ===================================================
app.post('/webhook-mp', async (req, res) => {
    // 1. Responder de inmediato 200 OK para asegurar el éxito en la web de MP
    res.status(200).send("OK");

    console.log("\n🔔 ¡Llegó una señal desde Mercado Pago!");
    console.log("Datos recibidos:", JSON.stringify(req.body));

    // MODO SIMULADOR FORZADO: Si es una prueba del panel de MP, disparamos el relé directamente
    mqttClient.publish(MQTT_TOPICO, "20", { qos: 1 });
    console.log("[SIMULACIÓN exitosa] Enviando pulso de 20 segundos al ESP32.");
});

// Levantar el servidor local
const PUERTO = 3000;
app.listen(PUERTO, () => {
    console.log(`🚀 Servidor backend corriendo en el puerto ${PUERTO}`);
});