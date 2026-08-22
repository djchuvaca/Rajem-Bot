# Validación operativa de staging

Estas comprobaciones necesitan servicios externos o tiempo real. Por eso no forman parte de `npm test`: una prueba automática local no puede demostrar que WhatsApp, PM2, GitHub o Nginx estén disponibles.

## Antes de probar

- [ ] `git log -1 --oneline` coincide con el commit esperado.
- [ ] `npm test` termina con cero fallos y cero pruebas pendientes.
- [ ] `npm run check:staging` valida el motor logístico y las bases configuradas.
- [ ] Existe un respaldo restaurable de `data/`, `envs/` y `data/tenants.json`.
- [ ] Los procesos staging usan `/opt/Rajem-Bot-staging` y no rutas de producción.

## Flujo funcional real

- [ ] Completar el onboarding del tenant y recargar el panel; la configuración permanece.
- [ ] Cambiar disponibilidad de un producto: permanece visible en el panel y se oculta o muestra correctamente en WhatsApp.
- [ ] Confirmar que producto, presentación, corte y precio coinciden entre Superadmin, tenant, menú de WhatsApp y resumen del pedido.
- [ ] Completar un pedido a domicilio, incluida dirección, tarifa, pago, `!confirmar`, solicitud de mandadito, toma por un repartidor y entrega.
- [ ] Reiniciar el tenant durante una orden pendiente; al reconectar atiende mensajes y no duplica avisos, timeouts ni despachos.
- [ ] Operar dos tenants simultáneos y confirmar que catálogos, clientes, pedidos, sesiones y mensajes no se mezclan.

## Despliegue y recuperación

- [ ] Un push al repositorio de pruebas actualiza solamente staging y reinicia limpiamente Superadmin, webhook y tenants de staging.
- [ ] Revisar los logs durante 24 horas: sin errores de catálogo, tareas duplicadas ni accesos a rutas de producción.
- [ ] Restaurar una copia del respaldo en una ruta temporal y comparar catálogo, configuración, pedidos y clientes.
- [ ] Migrar una copia anonimizada de una base antigua y confirmar que conserva el historial y supera `npm test`.

## Paso a producción

- [ ] Ejecutar 2 o 3 pedidos piloto completos.
- [ ] Ampliar gradualmente a los tenants y vigilar alertas durante 48 horas.
- [ ] Mantener disponible el rollback durante al menos 7 días antes de retirar compatibilidad histórica.

## Deuda histórica no operativa

Las tablas y columnas antiguas (`productos`, sus precios históricos y `cortes.precio_base`) no son fuentes operativas. Su retiro físico debe hacerse en una migración independiente, con respaldo probado y verificación de cero lecturas. No debe mezclarse con un cambio funcional ni contarse como prueba manual pendiente.
