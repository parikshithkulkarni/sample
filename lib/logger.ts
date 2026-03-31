import { reportError } from '@/lib/error-reporter';

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, msg: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data,
  };
}

function serialize(entry: LogEntry): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({ ...entry, error: '[unserializable]' });
  }
}

export const logger = {
  info(msg: string, data?: Record<string, unknown>) {
    console.log(serialize(formatEntry('info', msg, data)));
  },
  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(serialize(formatEntry('warn', msg, data)));
  },
  error(msg: string, err?: unknown, data?: Record<string, unknown>) {
    const errorData: Record<string, unknown> = { ...data };
    let errorMessage = msg;
    let errorStack: string | undefined;

    if (err instanceof Error) {
      errorData.error = err.message;
      errorData.stack = err.stack;
      errorMessage = `${msg}: ${err.message}`;
      errorStack = err.stack;
    } else if (err !== undefined) {
      errorData.error = String(err);
      errorMessage = `${msg}: ${String(err)}`;
    }
    console.error(serialize(formatEntry('error', msg, errorData)));

    // Side-effect: report to error monitoring (fire-and-forget)
    reportError({
      source: 'be',
      severity: 'error',
      message: errorMessage,
      stack: errorStack,
      context: data,
    });
  },
};
