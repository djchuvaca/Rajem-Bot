# Bot de Tacos Javier

Bot de WhatsApp con IA que atiende clientes, toma pedidos y gestiona tu taquería desde el celular. Incluye panel web de administración, pagos con MercadoPago y backups automáticos.

---

## Requisitos

- Node.js 18 o mayor — https://nodejs.org
- Google Chrome instalado (lo usa whatsapp-web.js)
- Cuenta de Groq (gratis) — https://console.groq.com
- Cuenta de Sentry (opcional, monitoreo de errores) — https://sentry.io
- Cuenta de MercadoPago (opcional, pagos con link) — https://mercadopago.com.mx

---

## Instalación

### 1. Instala dependencias
```bash
npm install
```

### 2. Configura el entorno
```bash
cp .env.example .env
```
Abre `.env` y completa los valores:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GROQ_API_KEY` | Sí | API key de Groq (`gsk_...`) |
| `GRUPO_ID` | Sí | JID del grupo de WhatsApp administración (`521XXXXXXXXXX@g.us`) |
| `PANEL_PORT` | No | Puerto del panel web (default: 3000) |
| `PANEL_SECRET` | No* | Secreto para firmar cookies de sesión. Usar en producción. |
| `TENANT_ID` | No | Nombre de la sesión WA. Cambiar si corres varias instancias. |
| `SENTRY_DSN` | No | DSN de Sentry para captura de errores en producción. |
| `MERCADOPAGO_ACCESS_TOKEN` | No | Access token de MP para generar links de pago. |
| `APP_URL` | No | URL pública del servidor (requerida si usas MercadoPago). |

### 3. Configura el negocio
**Opción A — Wizard web** (recomendado): inicia el bot y abre el panel. Al primer login se abre automáticamente el asistente de configuración de 5 pasos.

**Opción B — CLI interactivo**:
```bash
node scripts/onboarding.js
```

---

## Arrancar

### Desarrollo
```bash
npm run dev   # nodemon reinicia automáticamente al guardar archivos
```

### Producción con PM2
```bash
npm install -g pm2
npm run pm2:start      # arrancar
pm2 save               # persistir entre reinicios del sistema
pm2 startup            # arrancar con el sistema operativo
```

Comandos útiles de PM2:
```bash
pm2 logs carnitas-bot  # ver logs en tiempo real
pm2 restart carnitas-bot
pm2 stop carnitas-bot
```

---

## Conectar WhatsApp

Al iniciar, aparece un QR en la terminal. Escanéalo desde WhatsApp:
**Dispositivos vinculados → Vincular dispositivo**

La sesión se guarda localmente en `.wwebjs_auth/`. Si la sesión expira, borra esa carpeta y vuelve a escanear.

---

## Panel de administración

Accede en `http://localhost:3000` (o el puerto configurado).
- Usuario: `admin`
- Contraseña: `admin123` (cámbiala desde el panel o con `npm run reset-password`)

### Secciones del panel
| Sección | Función |
|---|---|
| Dashboard | Stats del día, pedidos recientes, gráfico histórico |
| Pedidos | Historial completo con filtros por estado y fecha, exportar CSV |
| Clientes | Base de datos, agregar/editar/eliminar |
| Productos | Menú, precios, sinónimos para el NLU |
| Horarios | Activar días y definir rangos de horas |
| Datos Banco | CLABE para pagos por transferencia |
| Mensajes Bot | Personalizar textos del bot |
| Configuración | Nombre del negocio, costo domicilio, etc. |
| Inicio rápido | Wizard de configuración inicial (5 pasos) |

---

## Comandos de grupo

Envía estos comandos desde el grupo de WhatsApp de administración:

### Ver pedidos
| Comando | Acción |
|---|---|
| `!pedidos` | Todos los pedidos de hoy |
| `!pendientes` | Solo pendientes |
| `!confirmados` | Solo confirmados |
| `!cancelados` | Cancelados y rechazados |
| `!domicilios` | Solo domicilios pendientes |
| `!mostradores` | Solo mostradores pendientes |
| `!pedido #ID` | Detalle de un pedido específico |

### Gestionar pedidos
| Comando | Acción |
|---|---|
| `!confirmar #ID` | Confirmar pedido |
| `!listo #ID` | Marcar como listo |
| `!cancelar #ID` | Cancelar pedido |
| `!rechazar #ID` | Rechazar pedido |

### Clientes
| Comando | Acción |
|---|---|
| `!cliente TELÉFONO` | Ver perfil de cliente |
| `!buscar NOMBRE` | Buscar cliente por nombre |
| `!historial TELÉFONO` | Últimos 15 pedidos |
| `!top` | Top 10 clientes por pedidos |
| `!mensaje TELÉFONO texto` | Enviar mensaje directo |

### Reportes
| Comando | Acción |
|---|---|
| `!stats` | Resumen del día |
| `!reporte ayer` | Reporte de ayer |
| `!reporte semana` | Últimos 7 días |
| `!reporte mes` | Últimos 30 días |

### Menú
| Comando | Acción |
|---|---|
| `!precios` | Lista de precios actual |
| `!precio CORTE X Y` | Cambiar precio taco/torta |
| `!agotado CORTE` | Desactivar corte |
| `!disponible CORTE` | Reactivar corte |

### Control del bot
| Comando | Acción |
|---|---|
| `!cerrar` | Cerrar el negocio manualmente |
| `!abrir` | Abrir el negocio manualmente |
| `!pausar` | Pausar atención (bot deja de responder) |
| `!reanudar` | Reanudar atención |
| `!sesiones` | Ver sesiones activas |
| `!limpiar` | Eliminar todas las sesiones activas (con confirmación) |
| `!resetear TELÉFONO` | Resetear sesión de un cliente |
| `!estado` | Estado del bot y WhatsApp |
| `!ayuda` | Lista completa de comandos |

---

## Pagos con MercadoPago (opcional)

Cuando `MERCADOPAGO_ACCESS_TOKEN` y `APP_URL` están configurados, el bot genera automáticamente un link de pago al confirmar un pedido de transferencia. El webhook en `/webhook/mercadopago` recibe la confirmación de MP y:
1. Actualiza el estado del pedido en la BD
2. Notifica al cliente por WhatsApp
3. Notifica al grupo de administración

Sin MercadoPago, el flujo sigue siendo: el cliente paga vía CLABE y envía comprobante por imagen.

---

## Backups

El bot crea un backup de la BD automáticamente cada 6 horas en `data/backups/`. También puedes ejecutarlo manualmente:
```bash
npm run backup
```

---

## Tests
```bash
npm test
```
Corre 4 archivos de tests con el runner nativo de Node.js (sin dependencias externas). Los tests usan better-sqlite3 real, sin mocks.

---

## Logs

| Archivo | Contenido |
|---|---|
| `logs/bot-combined.log` | Todo (info, warn, error) |
| `logs/bot-err.log` | Solo errores |
| Consola | Output coloreado en tiempo real |

---

## Scripts disponibles

```bash
npm run onboarding        # asistente de configuración inicial (CLI)
npm run reset-password    # cambiar contraseña del panel sin saber la actual
npm run backup            # backup manual de la BD
npm run nuevo-tenant      # provisionar nueva instancia (SaaS)
npm run pm2:start         # arrancar con PM2
npm run pm2:stop          # detener PM2
npm run pm2:logs          # ver logs de PM2
```

---

## Solución de problemas

**El QR no aparece o expiró**
→ Borra la carpeta `.wwebjs_auth/` y vuelve a ejecutar.

**"Cannot find module" al iniciar**
→ Ejecuta `npm install` de nuevo.

**WhatsApp se desconecta**
→ El bot reintenta automáticamente con backoff exponencial (hasta 8 veces). Si falla, PM2 reinicia el proceso.

**El panel no carga / error 503 en /health**
→ Verifica que la BD esté accesible y que WhatsApp esté conectado.

**Olvidé la contraseña del panel**
→ `npm run reset-password`
