export interface PinLockoutStatus {
  failedAttempts: number;
  attemptsRemaining: number;
  remainingMs: number;
}

interface StoredPinLockout {
  failedAttempts: number;
  lockedUntil: number | null;
}

const PIN_LOCKOUT_KEY = 'pwgen.pin_lockout';
const LOCKOUT_DURATIONS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

function readPinLockout(): StoredPinLockout {
  const raw = localStorage.getItem(PIN_LOCKOUT_KEY);
  if (raw === null) return { failedAttempts: 0, lockedUntil: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('No es pot llegir l’estat de seguretat del PIN.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('L’estat de seguretat del PIN no és vàlid.');
  }
  const state = parsed as Record<string, unknown>;
  if (
    typeof state.failedAttempts !== 'number' ||
    !Number.isInteger(state.failedAttempts) ||
    state.failedAttempts < 0 ||
    (state.lockedUntil !== null &&
      (typeof state.lockedUntil !== 'number' || !Number.isFinite(state.lockedUntil)))
  ) {
    throw new Error('L’estat de seguretat del PIN no és vàlid.');
  }

  return {
    failedAttempts: state.failedAttempts,
    lockedUntil: state.lockedUntil,
  };
}

function attemptsUntilNextLockout(failedAttempts: number): number {
  return failedAttempts < 3 ? 3 - failedAttempts : 1;
}

function toStatus(state: StoredPinLockout, now: number): PinLockoutStatus {
  return {
    failedAttempts: state.failedAttempts,
    attemptsRemaining: attemptsUntilNextLockout(state.failedAttempts),
    remainingMs: state.lockedUntil === null ? 0 : Math.max(0, state.lockedUntil - now),
  };
}

export function getPinLockoutStatus(now = Date.now()): PinLockoutStatus {
  return toStatus(readPinLockout(), now);
}

export function recordPinFailure(now = Date.now()): PinLockoutStatus {
  const current = readPinLockout();
  if (current.lockedUntil !== null && current.lockedUntil > now) {
    return toStatus(current, now);
  }

  const failedAttempts = current.failedAttempts + 1;
  const durationIndex = Math.min(failedAttempts - 3, LOCKOUT_DURATIONS_MS.length - 1);
  const lockedUntil = failedAttempts >= 3
    ? now + LOCKOUT_DURATIONS_MS[durationIndex]
    : null;
  const nextState = { failedAttempts, lockedUntil };
  localStorage.setItem(PIN_LOCKOUT_KEY, JSON.stringify(nextState));
  return toStatus(nextState, now);
}

export function clearPinLockout(): void {
  localStorage.removeItem(PIN_LOCKOUT_KEY);
}
