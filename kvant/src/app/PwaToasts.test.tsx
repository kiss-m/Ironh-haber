import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pwa, resetPwaMock } from '../test/pwaRegisterMock.ts';
import { PwaToasts } from './PwaToasts.tsx';

vi.mock('virtual:pwa-register/react', () => import('../test/pwaRegisterMock.ts'));

beforeEach(() => {
  resetPwaMock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PwaToasts', () => {
  it('shows nothing while there is nothing to say', () => {
    render(<PwaToasts />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers a waiting update and reloads only when asked', async () => {
    pwa.needRefresh = true;
    const user = userEvent.setup();
    render(<PwaToasts />);

    expect(screen.getByRole('status')).toHaveTextContent('Nová verzia');
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Obnoviť' }));

    expect(pwa.updateServiceWorker).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('lets the update wait when the user says "Neskôr"', async () => {
    pwa.needRefresh = true;
    const user = userEvent.setup();
    render(<PwaToasts />);

    await user.click(screen.getByRole('button', { name: 'Neskôr' }));

    expect(pwa.setNeedRefresh).toHaveBeenCalledExactlyOnceWith(false);
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();
  });

  it('announces offline readiness and dismisses it by itself', () => {
    vi.useFakeTimers();
    pwa.offlineReady = true;
    render(<PwaToasts />);

    expect(screen.getByRole('status')).toHaveTextContent('Kvant je pripravený aj bez internetu.');
    expect(pwa.setOfflineReady).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(pwa.setOfflineReady).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('prefers the update over the offline message', () => {
    pwa.needRefresh = true;
    pwa.offlineReady = true;
    render(<PwaToasts />);

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Nová verzia');
  });
});
