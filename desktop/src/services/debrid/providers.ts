import { TorrentInfo, UnrestrictedLink, DEBRID_CONFIGS } from "./types";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export interface DebridProvider {
  id: string;
  name: string;

  // Account
  validateApiKey(): Promise<boolean>;
  getAccountInfo(): Promise<any>;

  // Torrents
  addMagnet(magnetUri: string): Promise<string>; // Returns torrent ID
  getTorrentInfo(torrentId: string): Promise<TorrentInfo>;
  selectFiles(torrentId: string, fileIds: number[]): Promise<void>;
  deleteTorrent(torrentId: string): Promise<void>;

  // Instant availability
  checkInstantAvailability(hashes: string[]): Promise<Record<string, boolean>>;

  // Links
  unrestrictLink(link: string): Promise<UnrestrictedLink>;
}

// Real-Debrid implementation
export class RealDebridProvider implements DebridProvider {
  id = "realdebrid";
  name = "Real-Debrid";

  private apiKey: string;
  private baseUrl = DEBRID_CONFIGS.realdebrid.apiBaseUrl;
  private lastRequestTime = 0;
  private minRequestInterval = 500; // Minimum 500ms between requests

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Ensure we don't make requests too quickly
  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries = 3,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Throttle requests to avoid rate limiting
    await this.throttle();

    for (let attempt = 0; attempt < retries; attempt++) {
      const response = await tauriFetch(url, {
        method: options.method || "GET",
        body: options.body as any,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        let error: any = {};
        try {
          error = JSON.parse(text);
        } catch {
          error = { error: text || `Request failed: ${response.status}` };
        }

        // Handle rate limiting with retry
        if (
          response.status === 429 ||
          error.error === "too_many_requests" ||
          error.error_code === 5
        ) {
          if (attempt < retries - 1) {
            const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
            console.log(
              `Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})`,
            );
            await this.sleep(delay);
            continue;
          }
          // All retries exhausted for rate limiting
          throw new Error(
            `Rate limited by Real-Debrid. Please wait a moment and try again.`,
          );
        }

        throw new Error(
          error.error ||
            error.message ||
            `Request failed with status ${response.status}`,
        );
      }

      // Handle empty responses
      const text = await response.text();
      if (!text || text.trim() === "") {
        return {} as T;
      }

      try {
        return JSON.parse(text);
      } catch {
        return {} as T;
      }
    }

    throw new Error("Max retries exceeded");
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.request("/user");
      return true;
    } catch {
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    return this.request("/user");
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const formData = new FormData();
    formData.append("magnet", magnetUri);

    const result = await this.request<{ id: string }>("/torrents/addMagnet", {
      method: "POST",
      body: formData,
    });

    return result.id;
  }

  async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
    const result = await this.request<any>(`/torrents/info/${torrentId}`);

    // Debug log raw response
    console.log("Raw RD torrent info:", {
      status: result.status,
      progress: result.progress,
      links: result.links,
      files: result.files?.map((f: any) => ({
        id: f.id,
        path: f.path,
        selected: f.selected,
      })),
    });

    return {
      id: result.id,
      filename: result.filename,
      hash: result.hash,
      bytes: result.bytes,
      files: (result.files || []).map((f: any, i: number) => ({
        id: f.id !== undefined ? f.id : i + 1, // RD file IDs are 1-based
        path: f.path,
        bytes: f.bytes,
        selected: f.selected === 1,
      })),
      status: result.status,
      progress: result.progress,
      links: result.links || [],
    };
  }

  async selectFiles(torrentId: string, fileIds: number[]): Promise<void> {
    const formData = new FormData();
    formData.append("files", fileIds.join(","));

    await this.request(`/torrents/selectFiles/${torrentId}`, {
      method: "POST",
      body: formData,
    });
  }

  async deleteTorrent(torrentId: string): Promise<void> {
    await this.request(`/torrents/delete/${torrentId}`, {
      method: "DELETE",
    });
  }

  async checkInstantAvailability(
    hashes: string[],
  ): Promise<Record<string, boolean>> {
    // Real-Debrid disabled this endpoint, return all as potentially available
    // The actual availability will be checked when adding the magnet
    const availability: Record<string, boolean> = {};
    for (const hash of hashes) {
      availability[hash] = true; // Assume available, will fail gracefully if not
    }
    return availability;
  }

  async unrestrictLink(link: string): Promise<UnrestrictedLink> {
    const formData = new FormData();
    formData.append("link", link);

    const result = await this.request<any>("/unrestrict/link", {
      method: "POST",
      body: formData,
    });

    return {
      id: result.id,
      filename: result.filename,
      filesize: result.filesize,
      link: result.link,
      host: result.host,
      streamable: result.streamable === 1,
      download: result.download,
      mimeType: result.mimeType,
      quality: result.quality,
    };
  }
}

// AllDebrid implementation
export class AllDebridProvider implements DebridProvider {
  id = "alldebrid";
  name = "AllDebrid";

  private apiKey: string;
  private baseUrl = DEBRID_CONFIGS.alldebrid.apiBaseUrl;
  private agent = "Streamio";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append("agent", this.agent);
    url.searchParams.append("apikey", this.apiKey);

    const response = await tauriFetch(url.toString(), {
      method: options.method || "GET",
      body: options.body as any,
    });

    if (!response.ok) {
      const text = await response.text();
      let error: any = {};
      try {
        error = JSON.parse(text);
      } catch {
        error = {
          error: { message: text || `Request failed: ${response.status}` },
        };
      }
      throw new Error(
        error.error?.message || `Request failed: ${response.status}`,
      );
    }

    const text = await response.text();
    if (!text || text.trim() === "") {
      return {} as T;
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return {} as T;
    }

    if (data.status !== "success") {
      throw new Error(data.error?.message || "Request failed");
    }

    return data.data;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.request("/user");
      return true;
    } catch {
      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    return this.request("/user");
  }

  async addMagnet(magnetUri: string): Promise<string> {
    const formData = new FormData();
    formData.append("magnets[]", magnetUri);

    const result = await this.request<any>("/magnet/upload", {
      method: "POST",
      body: formData,
    });

    return result.magnets[0].id.toString();
  }

  async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
    const result = await this.request<any>(`/magnet/status?id=${torrentId}`);
    const magnet = result.magnets;

    return {
      id: magnet.id.toString(),
      filename: magnet.filename,
      hash: magnet.hash,
      bytes: magnet.size,
      files: (magnet.links || []).map((link: any, i: number) => ({
        id: i,
        path: link.filename,
        bytes: link.size,
        selected: true,
      })),
      status: magnet.status,
      progress: magnet.downloaded ? (magnet.downloaded / magnet.size) * 100 : 0,
      links: magnet.links?.map((l: any) => l.link) || [],
    };
  }

  async selectFiles(_torrentId: string, _fileIds: number[]): Promise<void> {
    // AllDebrid auto-selects all files
  }

  async deleteTorrent(torrentId: string): Promise<void> {
    await this.request(`/magnet/delete?id=${torrentId}`, {
      method: "GET",
    });
  }

  async checkInstantAvailability(
    hashes: string[],
  ): Promise<Record<string, boolean>> {
    const result = await this.request<any>(
      `/magnet/instant?magnets[]=${hashes.join("&magnets[]=")}`,
    );

    const availability: Record<string, boolean> = {};

    for (let i = 0; i < hashes.length; i++) {
      availability[hashes[i]] = result.magnets[i]?.instant || false;
    }

    return availability;
  }

  async unrestrictLink(link: string): Promise<UnrestrictedLink> {
    const result = await this.request<any>(
      `/link/unlock?link=${encodeURIComponent(link)}`,
    );

    return {
      id: result.id,
      filename: result.filename,
      filesize: result.filesize,
      link: result.link,
      host: result.host,
      streamable: result.streaming ? true : false,
      download: result.link,
    };
  }
}

// Factory function
export function createDebridProvider(
  service: string,
  apiKey: string,
): DebridProvider | null {
  switch (service) {
    case "realdebrid":
      return new RealDebridProvider(apiKey);
    case "alldebrid":
      return new AllDebridProvider(apiKey);
    default:
      return null;
  }
}
