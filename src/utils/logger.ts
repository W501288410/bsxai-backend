import winston from 'winston'
import 'winston-daily-rotate-file'
import path from 'path'

const logDir = path.join(__dirname, '..', '..', 'logs')

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
  })
)

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: consoleFormat
    }),
    // 按日期轮转的日志文件
    new winston.transports.DailyRotateFile({
      dirname: path.join(logDir, 'app'),
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m'
    }),
    // 错误日志单独存储
    new winston.transports.DailyRotateFile({
      dirname: path.join(logDir, 'error'),
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '20m'
    })
  ]
})