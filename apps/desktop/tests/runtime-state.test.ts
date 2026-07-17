import { describe, expect, it } from 'vitest';

import { deriveRuntimePresentation } from '../src/openclaw/model/runtime-state';

describe('runtime presentation', () => {
  it('keeps starting state after an invoke request has returned', () => {
    expect(deriveRuntimePresentation('starting', false, null)).toEqual({
      busy: true,
      canStart: false,
      canStop: true,
      label: '服务启动中',
      tone: 'pending'
    });
  });

  it('allows retry after a failed runtime without auto-restarting', () => {
    expect(deriveRuntimePresentation('failed', false, 'Gateway 启动超时')).toEqual({
      busy: false,
      canStart: true,
      canStop: false,
      label: '启动失败',
      tone: 'error'
    });
  });

  it('keeps a live gateway non-startable when readiness is degraded', () => {
    expect(deriveRuntimePresentation('running', false, null)).toEqual({
      busy: false,
      canStart: false,
      canStop: true,
      label: '运行中，尚未就绪',
      tone: 'pending'
    });
  });
});
