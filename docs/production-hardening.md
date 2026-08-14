# Endurecimiento de producción

## Secretos obligatorios

En producción deben existir `SUPERADMIN_SECRET`, `WEBHOOK_SECRET` y un `PANEL_SECRET` diferente para cada tenant, todos con un mínimo de 32 caracteres. `COOKIE_SECURE=1` debe habilitarse cuando los paneles se publiquen exclusivamente mediante HTTPS; si existe un proxy inverso, configure también `TRUST_PROXY=1`.

Las credenciales de las pasarelas se guardan con AES-256-GCM usando el `PANEL_SECRET` del tenant. El superadmin obtiene ese secreto desde `envs/<tenant-id>.env`; el archivo debe conservar permisos `600`. Los valores históricos en texto plano se migran a cifrado la próxima vez que el superadmin guarda la configuración del tenant.

La contraseña del superadmin se solicita nuevamente para modificar el usuario o la contraseña de un panel tenant. El intento y el cambio quedan registrados en `admin_auditoria`.

## Despliegue y recuperación

`scripts/deploy-safe.sh` es la única ruta recomendada de actualización. El script:

1. bloquea despliegues concurrentes;
2. cancela si existen cambios rastreados en producción;
3. respalda todas las bases mediante la API de SQLite;
4. exige avance fast-forward;
5. instala dependencias cuando corresponde;
6. ejecuta toda la suite de pruebas;
7. reinicia PM2 y comprueba los endpoints de salud;
8. restaura el commit anterior si cualquier paso falla.

Los respaldos se almacenan en `data/backups/deploy/` y no se versionan. Debe realizarse trimestralmente una restauración en un VPS o directorio aislado y documentar el resultado.

## Limitación de WhatsApp

`whatsapp-web.js` no sustituye la API oficial de WhatsApp Business. Se debe monitorear desconexión, QR pendiente y cambios incompatibles del cliente web. Para operaciones con garantías estrictas de disponibilidad se recomienda planificar una migración a Cloud API como transporte alternativo, conservando el NLU y los módulos Giro actuales.

Al 14 de agosto de 2026, `npm audit` conserva cinco hallazgos altos en la cadena `whatsapp-web.js@1.34.7 → puppeteer@24.38.0 → @puppeteer/browsers@2.13.0 → extract-zip@2.0.1`. `extract-zip@2.0.1` sigue siendo la versión pública más reciente y WhatsApp fija Puppeteer 24; forzar Puppeteer 25 no está soportado por esa versión. El riesgo se concentra en la descarga/extracción del navegador durante la instalación, no en el procesamiento de pedidos. Debe revisarse al actualizar `whatsapp-web.js` y no debe aceptarse automáticamente un cambio mayor sin validar conexión, QR y envío/recepción real.
