// PAT 保险箱：用用户密码加密 PAT 后存 localStorage，明文只活在 sessionStorage（标签页生命周期）。
// 加密：PBKDF2(310k, SHA-256) 派生 AES-GCM 256 密钥。GCM 自带认证——解密失败即密码错误。
const VAULT_KEY = 'rh.vault';
const SESSION_KEY = 'rh.pat.session';
const LEGACY_KEY = 'rh.pat'; // 旧版明文存储，迁移后删除

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealPat(pat: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(pat.trim()),
  );
  localStorage.setItem(VAULT_KEY, JSON.stringify({ s: b64(salt), i: b64(iv), c: b64(ct) }));
  sessionStorage.setItem(SESSION_KEY, pat.trim());
}

/** 密码正确返回 PAT 并缓存到 session；错误返回 null */
export async function openVault(password: string): Promise<string | null> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    const { s, i, c } = JSON.parse(raw) as { s: string; i: string; c: string };
    const key = await deriveKey(password, unb64(s));
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(i) as BufferSource },
      key,
      unb64(c) as BufferSource,
    );
    const pat = new TextDecoder().decode(pt);
    sessionStorage.setItem(SESSION_KEY, pat);
    return pat;
  } catch {
    return null; // GCM 认证失败 = 密码错误
  }
}

export const hasVault = (): boolean => localStorage.getItem(VAULT_KEY) !== null;

export const getSessionPat = (): string | null => sessionStorage.getItem(SESSION_KEY);

export function clearVault(): void {
  localStorage.removeItem(VAULT_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

/** 旧版明文 PAT 一次性迁移：取出并立即从 localStorage 删除 */
export function takeLegacyPat(): string | null {
  const v = localStorage.getItem(LEGACY_KEY);
  if (v) localStorage.removeItem(LEGACY_KEY);
  return v;
}
