// Helpers around the local RustDesk client.

const STORAGE_KEY = 'bbb-remote-control:rustdesk-id';

// RustDesk IDs are normally 9-10 digits; custom IDs are alphanumeric. Anything else is
// rejected so a malicious payload can never inject extra parameters into the URI.
const ID_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;

export function normalizeId(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function loadMyId(): string {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY) || '';
    return isValidId(v) ? v : '';
  } catch {
    return '';
  }
}

export function saveMyId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage blocked (private mode) — the ID simply won't be remembered
  }
}

// Opens a connection in the locally installed RustDesk client.
export function connectUri(id: string): string {
  if (!isValidId(id)) throw new Error('invalid RustDesk id');
  return `rustdesk://connection/new/${id}`;
}

export function newReqId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
