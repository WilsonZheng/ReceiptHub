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

  /**
   * 这个凭证能不能进数据仓库：解锁时先问一次，输错了当场说，而不是进去之后才冒出同步失败。
   * 凭证无效是 401；没有这个仓库的权限时 GitHub 回 404（不暴露私有仓库是否存在）。
   * 断网、限流（403）、服务故障等其它情况抛异常，由调用方决定（照样放行）。
   */
  async canAccess(): Promise<boolean> {
    const res = await fetch(`${API}/repos/${this.repo}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json' },
    });
    if (res.ok) return true;
    // 403 不算密码错：GitHub 限流也回 403，这时把人挡在外面比放进去更糟
    if (res.status === 401 || res.status === 404) return false;
    throw new Error(`github access check: ${res.status}`);
  }

  async getFile(path: string): Promise<RemoteFile | null> {
    const res = await this.req(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`github GET ${path}: ${res.status}`);
    const json = (await res.json()) as { content: string; sha: string };
    return { text: fromBase64(json.content), sha: json.sha };
  }

  /** 二进制文件原样下载（照片/PDF）：raw 媒体类型直接返回文件内容，不走 base64 */
  async getBlob(path: string): Promise<Blob | null> {
    const res = await this.req(path, { headers: { Accept: 'application/vnd.github.raw' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`github GET ${path}: ${res.status}`);
    return res.blob();
  }

  async getSha(path: string): Promise<string | null> {
    const res = await this.req(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`github GET ${path}: ${res.status}`);
    const json = (await res.json()) as { sha: string };
    return json.sha;
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
