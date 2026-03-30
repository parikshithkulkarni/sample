import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '@/lib/logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('logs info as structured JSON', () => {
    logger.info('test message', { key: 'value' });
    expect(console.log).toHaveBeenCalledOnce();
    const logged = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(logged.level).toBe('info');
    expect(logged.msg).toBe('test message');
    expect(logged.key).toBe('value');
    expect(logged.timestamp).toBeDefined();
  });

  it('logs warn as structured JSON', () => {
    logger.warn('warning message');
    expect(console.warn).toHaveBeenCalledOnce();
    const logged = JSON.parse((console.warn as any).mock.calls[0][0]);
    expect(logged.level).toBe('warn');
    expect(logged.msg).toBe('warning message');
  });

  it('logs error with Error object', () => {
    const err = new Error('test error');
    logger.error('something failed', err);
    expect(console.error).toHaveBeenCalledOnce();
    const logged = JSON.parse((console.error as any).mock.calls[0][0]);
    expect(logged.level).toBe('error');
    expect(logged.msg).toBe('something failed');
    expect(logged.error).toBe('test error');
    expect(logged.stack).toBeDefined();
  });

  it('logs error with string error', () => {
    vi.mocked(console.error).mockClear();
    logger.error('something failed', 'string error');
    const logged = JSON.parse((console.error as any).mock.calls[0][0]);
    expect(logged.error).toBe('string error');
  });

  it('logs error with additional data', () => {
    vi.mocked(console.error).mockClear();
    logger.error('failed', new Error('oops'), { requestId: '123' });
    const logged = JSON.parse((console.error as any).mock.calls[0][0]);
    expect(logged.requestId).toBe('123');
    expect(logged.error).toBe('oops');
  });
});
