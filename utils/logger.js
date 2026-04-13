'use strict';

const IS_PROD = process.env.NODE_ENV === 'production';
const DEBUG   = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

const COLORS = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  info:    '\x1b[36m',   // cyan
  warn:    '\x1b[33m',   // yellow
  error:   '\x1b[31m',   // red
  success: '\x1b[32m',   // green
  debug:   '\x1b[35m',   // magenta
};

function timestamp() {
  return new Date().toISOString();
}

function formatHuman(level, context, msg, meta) {
  const color  = COLORS[level] || COLORS.info;
  const prefix = context ? `[${context}] ` : '';
  const metaStr = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `${COLORS.dim}${timestamp()}${COLORS.reset} ${color}${level.toUpperCase().padEnd(7)}${COLORS.reset} ${prefix}${msg}${COLORS.dim}${metaStr}${COLORS.reset}`;
}

function formatJson(level, context, msg, meta) {
  return JSON.stringify({ ts: timestamp(), level, ctx: context || null, msg, ...meta });
}

function write(level, context, msg, meta) {
  if (level === 'debug' && !DEBUG) return;
  const line = IS_PROD
    ? formatJson(level, context, msg, meta || {})
    : formatHuman(level, context, msg, meta);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

function makeLogger(context) {
  return {
    info:    (msg, meta) => write('info',    context, msg, meta),
    warn:    (msg, meta) => write('warn',    context, msg, meta),
    error:   (msg, meta) => write('error',   context, msg, meta),
    success: (msg, meta) => write('success', context, msg, meta),
    debug:   (msg, meta) => write('debug',   context, msg, meta),
    child:   (ctx)       => makeLogger(ctx),

    // Express request logger middleware
    http(req, res, next) {
      const start = Date.now();
      res.on('finish', () => {
        write('info', context || 'HTTP', `${req.method} ${req.url} ${res.statusCode}`, {
          ms: Date.now() - start,
          ip: req.ip,
        });
      });
      next();
    },
  };
}

module.exports = makeLogger(null);
