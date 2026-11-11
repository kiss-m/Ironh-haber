import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLearningDay } from './useLearningDay.ts';

const HOUR = 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

describe('useLearningDay', () => {
  it('gives the learning day, which before 04:00 is still yesterday', () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T02:30:00Z') }); // 03:30 in Prague

    const { result } = renderHook(() => useLearningDay());

    expect(result.current).toBe('2026-11-10');
  });

  it('moves on at 04:00 while the app stays open, day after day', () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T22:00:00Z') }); // 23:00 in Prague
    const { result } = renderHook(() => useLearningDay());
    expect(result.current).toBe('2026-11-10');

    act(() => {
      vi.advanceTimersByTime(5 * HOUR - 1000); // 03:59:59
    });
    expect(result.current).toBe('2026-11-10');

    act(() => {
      vi.advanceTimersByTime(3000); // 04:00:02
    });
    expect(result.current).toBe('2026-11-11');

    act(() => {
      vi.advanceTimersByTime(24 * HOUR);
    });
    expect(result.current).toBe('2026-11-12');
  });

  it('catches up when the app comes back after a night in the background', () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T22:00:00Z') });
    const { result } = renderHook(() => useLearningDay());

    // A sleeping phone runs no timers. The clock has simply moved on when it wakes up.
    vi.setSystemTime(new Date('2026-11-11T07:00:00Z'));
    expect(result.current).toBe('2026-11-10');

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-11-11');
  });

  it('stops watching the clock once nothing uses it', () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T22:00:00Z') });
    const { unmount } = renderHook(() => useLearningDay());
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
