const API = 'https://api.github.com';

export class AuthError extends Error {
  override name = 'AuthError';
}
export class ConflictError extends Error {
  override name = 'ConflictError';
}

export interface RemoteFile {
  text: string;
  sha: string;
}

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GithubClient {
  constructor(
    private token: string,
    private repo: string, // 'owner/name'
  ) {}

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${API}/repos/${this.repo}/contents/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 401 || res.status === 403) throw new AuthError(`github ${res.status}`);
    if (res.status === 409 || res.status === 422) throw new ConflictError(`github ${res.status}`);
    return res;
  }

  async getFile(path: string): Promise<RemoteFile | null> {
    const res = await this.req(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`github GET ${path}: ${res.status}`);
    const json = (await res.json()) as { content: string; sha: string };
    return { text: fromBase64(json.content), sha: json.sha };
  }

  async putRaw(
    path: string,
    base64: string,
    opts: { sha?: string; message: string },
  ): Promise<string> {
    const res = await this.req(path, {
      method: 'PUT',
      body: JSON.stringify({
        message: opts.message,
        content: base64,
        ...(opts.sha ? { sha: opts.sha } : {}),
      }),
    });
    if (!res.ok) throw new Error(`github PUT ${path}: ${res.status}`);
    const json = (await res.json()) as { content: { sha: string } };
    return json.content.sha;
  }

  async putFile(
    path: string,
    text: string,
    opts: { sha?: string; message: string },
  ): Promise<string> {
    return this.putRaw(path, await toBase64(new Blob([text])), opts);
  }

  async listDir(path: string): Promise<{ path: string; sha: string }[]> {
    const res = await this.req(path);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`github LIST ${path}: ${res.status}`);
    const json = (await res.json()) as { path: string; sha: string }[];
    return json.map((e) => ({ path: e.path, sha: e.sha }));
  }
}
