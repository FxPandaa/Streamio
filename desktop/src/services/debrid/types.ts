export interface DebridTorrent {
  id: string;
  filename: string;
  hash: string;
  bytes: number;
  status: "queued" | "downloading" | "downloaded" | "error";
  progress: number;
  speed?: number;
  seeders?: number;
  links?: string[];
}

export interface DebridLink {
  id: string;
  filename: string;
  filesize: number;
  link: string;
  host: string;
  streamable: boolean;
  mimeType?: string;
}

export interface UnrestrictedLink {
  id: string;
  filename: string;
  filesize: number;
  link: string;
  host: string;
  streamable: boolean;
  download: string;
  mimeType?: string;
  quality?: string;
}

export interface DebridFile {
  id: number;
  path: string;
  bytes: number;
  selected: boolean;
}

export interface TorrentInfo {
  id: string;
  filename: string;
  hash: string;
  bytes: number;
  files: DebridFile[];
  status: string;
  progress: number;
  links?: string[];
}

export interface DebridServiceConfig {
  id: string;
  name: string;
  apiBaseUrl: string;
  website: string;
  supportsInstant: boolean;
}

export const DEBRID_CONFIGS: Record<string, DebridServiceConfig> = {
  realdebrid: {
    id: "realdebrid",
    name: "Real-Debrid",
    apiBaseUrl: "https://api.real-debrid.com/rest/1.0",
    website: "https://real-debrid.com",
    supportsInstant: true,
  },
  alldebrid: {
    id: "alldebrid",
    name: "AllDebrid",
    apiBaseUrl: "https://api.alldebrid.com/v4",
    website: "https://alldebrid.com",
    supportsInstant: true,
  },
  torbox: {
    id: "torbox",
    name: "TorBox",
    apiBaseUrl: "https://api.torbox.app/v1/api",
    website: "https://torbox.app",
    supportsInstant: true,
  },
  premiumize: {
    id: "premiumize",
    name: "Premiumize",
    apiBaseUrl: "https://www.premiumize.me/api",
    website: "https://premiumize.me",
    supportsInstant: true,
  },
};
