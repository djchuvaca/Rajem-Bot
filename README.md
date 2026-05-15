# 🐷 Bot de Carnitas Tacos Javier

Bot de WhatsApp con IA (Groq) que atiende clientes y te notifica cuando hay una venta.

---

## ✅ Requisitos

- Node.js 18 o mayor → https://nodejs.org
- Google Chrome instalado (lo usa whatsapp-web.js internamente)
- Una cuenta de Groq (gratis) → https://console.groq.com

---

## 🚀 Instalación paso a paso

### 1. Descarga los archivos
Coloca todos los archivos en una carpeta, por ejemplo `carnitas-bot/`

### 2. Instala las dependencias
Abre una terminal dentro de la carpeta y ejecuta:
```bash
npm install
```
Esto puede tardar 1-2 minutos la primera vez.

### 3. Configura tu API Key de Groq
- Ve a https://console.groq.com
- Crea una cuenta gratis
- Ve a "API Keys" → "Create API Key"
- Copia la key (empieza con `gsk_...`)

Abre el archivo `.env` y reemplaza los valores:
```
GROQ_API_KEY=gsk_tu_key_real_aqui
MI_NUMERO=526671234567   ← tu número con código de país, sin + ni espacios
```

### 4. Inicia el bot
```bash
npm start
```

### 5. Escanea el QR
- Aparecerá un código QR en la terminal
- Abre WhatsApp en tu celular
- Ve a: **Dispositivos vinculados → Vincular dispositivo**
- Escanea el QR

¡Listo! El bot ya está activo. 🎉

---

## 📲 Cómo funciona

1. Un cliente te escribe a WhatsApp
2. El bot lo atiende automáticamente con IA
3. Cuando el cliente confirma su pedido, **tú recibes una notificación** en tu WhatsApp con:
   - Qué pidió
   - El total
   - Su número de teléfono
   - La hora

---

## ⚙️ Personalizar el menú y precios

Edita el archivo `index.js` y busca la sección `MENU`:

```javascript
const MENU = `
• Taco de carnitas:   $20 por pieza
• Torta de carnitas:  $55 por pieza
...
`;
```

Cambia los precios y guarda. Reinicia el bot con `npm start`.

---

## 🛑 Detener el bot

Presiona `Ctrl + C` en la terminal.

---

## ❓ Problemas comunes

**"Error: Cannot find module"**
→ Ejecuta `npm install` de nuevo.

**El QR no aparece o expiró**
→ Borra la carpeta `.wwebjs_auth` y vuelve a ejecutar `npm start`.

**"Error de autenticación"**
→ Borra la carpeta `.wwebjs_auth` y escanea el QR de nuevo.

**WhatsApp se desconecta solo**
→ Normal si el celular pierde internet. Vuelve a ejecutar `npm start`.

---

## 💡 Próximo paso: dejarlo corriendo siempre

Para que el bot funcione aunque cierres la terminal, instala PM2:
```bash
npm install -g pm2
pm2 start index.js --name carnitas-bot
pm2 save
```
