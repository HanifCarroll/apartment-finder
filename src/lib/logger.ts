import { mkdirSync } from "node:fs";
import pino from "pino";

mkdirSync("logs", { recursive: true });

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({
    dest: process.env.APP_LOG_PATH || "logs/app.log",
    sync: false,
    mkdir: true,
  }),
);
