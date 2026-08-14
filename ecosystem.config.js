// Configuración de PM2 para producción.
// Uso:
//   npm install -g pm2        ← instalar PM2 una sola vez
//   pm2 start ecosystem.config.js   ← arrancar
//   pm2 stop $TENANT_ID             ← detener
//   pm2 restart $TENANT_ID          ← reiniciar
//   pm2 logs $TENANT_ID             ← ver logs en tiempo real
//   pm2 save && pm2 startup         ← hacer que arranque con el sistema

module.exports = {
  apps: [

    // ── Super admin (proceso independiente) ────────────────────────────────────
    {
      name: "superadmin",
      script: "src/superadmin/standalone.js",
      autorestart: true,
      watch: false,
      env: { NODE_ENV: "production" },
      out_file:        "logs/superadmin-out.log",
      error_file:      "logs/superadmin-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

    // ── Webhook de deploy automático desde GitHub ──────────────────────────────
    {
      name: "webhook-deploy",
      script: "scripts/webhook-deploy.js",
      autorestart: true,
      watch: false,
      out_file:        "logs/webhook-out.log",
      error_file:      "logs/webhook-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

  ],
};
