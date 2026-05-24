const { createLogger, format, transports } = require("winston");
const path = require("path");
const fs   = require("fs");

const LOGS_DIR = path.join(__dirname, "../logs");
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);

const fmt = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
);

const logger = createLogger({
  level: "info",
  format: fmt,
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message }) => `${level}: ${message}`)
      ),
    }),
    new transports.File({ filename: path.join(LOGS_DIR, "bot-err.log"),      level: "error" }),
    new transports.File({ filename: path.join(LOGS_DIR, "bot-combined.log") }),
  ],
});

module.exports = logger;
