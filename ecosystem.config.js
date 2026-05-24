// Configuración de PM2 para producción.
// Uso:
//   npm install -g pm2        ← instalar PM2 una sola vez
//   pm2 start ecosystem.config.js   ← arrancar
//   pm2 stop carnitas-bot           ← detener
//   pm2 restart carnitas-bot        ← reiniciar
//   pm2 logs carnitas-bot           ← ver logs en tiempo real
//   pm2 save && pm2 startup         ← hacer que arranque con el sistema

module.exports = {
  apps: [
    {
      name: process.env.TENANT_ID || "carnitas-bot",
      script: "index.js",

      // Reiniciar automáticamente si el proceso muere
      autorestart: true,
      watch: false,           // no usar watch en producción (lo hace nodemon en dev)
      max_memory_restart: "1G",

      // Espera 15s entre reinicios para que WhatsApp Web pueda reconectarse
      restart_delay: 15000,
      max_restarts: 10,       // si falla 10 veces seguidas, PM2 deja de reintentar
      min_uptime: "30s",      // debe vivir al menos 30s para considerar el inicio exitoso

      // Variables de entorno (PM2 carga .env automáticamente si existe)
      env: {
        NODE_ENV: "production",
      },

      // Logs
      out_file:   "logs/bot-out.log",
      error_file: "logs/bot-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
