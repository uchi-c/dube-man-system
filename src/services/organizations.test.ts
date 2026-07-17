import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  stashPendingGoogleSignup, takePendingGoogleSignup,
  stashPendingInviteToken, takePendingInviteToken,
} from './organizations';

// Regression coverage for a real bug: signInWithOAuth can't carry custom
// user_metadata the way signUp() can, so the org-creation/invite-acceptance
// intent expressed before redirecting to Google is stashed in localStorage
// and consumed on return. Without an expiry, abandoning that flow (closing
// the tab, cancelling at Google) left the entry there indefinitely, so the
// NEXT unrelated Google sign-in on that browser would silently consume it.
// These tests lock in the 10-minute expiry that fixed it.

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', createMockStorage());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pending Google-signup stash', () => {
  it('round-trips within the expiry window', () => {
    stashPendingGoogleSignup({ orgName: 'Acme', ownerName: 'Jane', businessType: 'pharmacy' });
    vi.advanceTimersByTime(60_000); // 1 minute later — a normal OAuth round trip
    expect(takePendingGoogleSignup()).toEqual({ orgName: 'Acme', ownerName: 'Jane', businessType: 'pharmacy' });
  });

  it('is discarded once older than 10 minutes (abandoned flow)', () => {
    stashPendingGoogleSignup({ orgName: 'Acme' });
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(takePendingGoogleSignup()).toBeNull();
  });

  it('is single-use — a second take returns null', () => {
    stashPendingGoogleSignup({ orgName: 'Acme' });
    expect(takePendingGoogleSignup()).not.toBeNull();
    expect(takePendingGoogleSignup()).toBeNull();
  });

  it('returns null when nothing was ever stashed', () => {
    expect(takePendingGoogleSignup()).toBeNull();
  });
});

describe('pending invite-token stash', () => {
  it('round-trips within the expiry window', () => {
    stashPendingInviteToken('abc123');
    vi.advanceTimersByTime(60_000);
    expect(takePendingInviteToken()).toBe('abc123');
  });

  it('is discarded once older than 10 minutes (abandoned flow)', () => {
    stashPendingInviteToken('abc123');
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(takePendingInviteToken()).toBeNull();
  });

  it('is single-use — a second take returns null', () => {
    stashPendingInviteToken('abc123');
    expect(takePendingInviteToken()).toBe('abc123');
    expect(takePendingInviteToken()).toBeNull();
  });
});
