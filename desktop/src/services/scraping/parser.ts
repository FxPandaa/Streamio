/**
 * Torrent Parsing & Quality Detection
 *
 * Comprehensive parsing for torrent titles to extract:
 * - Resolution (4K, 1080p, 720p, etc.)
 * - Codec (HEVC, x264, AV1, etc.)
 * - HDR type (HDR10, HDR10+, Dolby Vision, etc.)
 * - Audio (Atmos, TrueHD, DTS, etc.)
 * - Source (WEB-DL, BluRay, Remux, etc.)
 * - Release group trust indicators
 */

export interface ParsedTorrentInfo {
  // Resolution
  resolution: string; // "4K", "1080p", "720p", "480p", "Unknown"
  resolutionRank: number; // 5=4K, 4=1080p, 3=720p, 2=480p, 1=Unknown

  // Video codec
  codec: string; // "HEVC", "x264", "AV1", "VP9", ""
  codecRank: number; // Higher is better for 4K

  // HDR information
  hdrType?: string; // "Dolby Vision", "HDR10+", "HDR10", "HDR", "HLG"
  hasDolbyVision: boolean;
  dvProfile?: string; // "5", "7", "8"
  hasHdr10Plus: boolean;
  hasHdr10: boolean;
  hasHdr: boolean;

  // Audio
  audioCodec?: string; // "Atmos", "TrueHD", "DTS-HD MA", "DTS", "DD5.1", "AAC"
  audioRank: number;
  hasAtmos: boolean;
  hasTrueHD: boolean;
  hasDTS: boolean;

  // Source type
  source: string; // "Remux", "BluRay", "WEB-DL", "WEBRip", "HDTV", "CAM", ""
  sourceRank: number;
  isRemux: boolean;
  isBluRay: boolean;
  isWebDl: boolean;

  // Release quality indicators
  is3D: boolean;
  isHDR: boolean; // Any HDR type
  isTrustedRelease: boolean;
  releaseGroup?: string;

  // File info
  hasProperTag: boolean;
  hasRepackTag: boolean;
  isMultiAudio: boolean;
  isMultiSubs: boolean;

  // Overall quality score (0-100)
  qualityScore: number;
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse resolution from title
 */
function parseResolution(title: string): { resolution: string; rank: number } {
  const lower = title.toLowerCase();

  if (
    lower.includes("2160p") ||
    lower.includes("4k") ||
    lower.includes("uhd")
  ) {
    return { resolution: "4K", rank: 5 };
  }
  if (lower.includes("1080p") || lower.includes("1080i")) {
    return { resolution: "1080p", rank: 4 };
  }
  if (lower.includes("720p")) {
    return { resolution: "720p", rank: 3 };
  }
  if (lower.includes("480p") || lower.includes("sd")) {
    return { resolution: "480p", rank: 2 };
  }

  return { resolution: "Unknown", rank: 1 };
}

/**
 * Parse video codec from title
 */
function parseCodec(title: string): { codec: string; rank: number } {
  const lower = title.toLowerCase();

  // AV1 - newest, very efficient
  if (lower.includes("av1")) {
    return { codec: "AV1", rank: 5 };
  }

  // HEVC/x265 - great for 4K
  if (
    lower.includes("hevc") ||
    lower.includes("x265") ||
    lower.includes("h.265") ||
    lower.includes("h265")
  ) {
    return { codec: "HEVC", rank: 4 };
  }

  // VP9 - good for web content
  if (lower.includes("vp9")) {
    return { codec: "VP9", rank: 3 };
  }

  // x264/H.264 - widely compatible
  if (
    lower.includes("x264") ||
    lower.includes("h.264") ||
    lower.includes("h264") ||
    lower.includes("avc")
  ) {
    return { codec: "x264", rank: 2 };
  }

  // MPEG-2/XviD - older codecs
  if (
    lower.includes("xvid") ||
    lower.includes("divx") ||
    lower.includes("mpeg")
  ) {
    return { codec: "MPEG", rank: 1 };
  }

  return { codec: "", rank: 0 };
}

/**
 * Parse HDR information from title
 */
function parseHDR(title: string): {
  hdrType?: string;
  hasDolbyVision: boolean;
  dvProfile?: string;
  hasHdr10Plus: boolean;
  hasHdr10: boolean;
  hasHdr: boolean;
} {
  const lower = title.toLowerCase();

  let hdrType: string | undefined;
  let hasDolbyVision = false;
  let dvProfile: string | undefined;
  let hasHdr10Plus = false;
  let hasHdr10 = false;
  let hasHdr = false;

  // Dolby Vision detection (highest priority)
  if (
    lower.includes("dolby vision") ||
    lower.includes("dolbyvision") ||
    /\bdovi?\b/.test(lower) ||
    /\bdv\b/.test(lower)
  ) {
    hasDolbyVision = true;
    hdrType = "Dolby Vision";

    // Check for DV profile
    const profileMatch = title.match(/DV\s*(?:Profile\s*)?(\d)/i);
    if (profileMatch) {
      dvProfile = profileMatch[1];
    }
  }

  // HDR10+ detection
  if (lower.includes("hdr10+") || lower.includes("hdr10plus")) {
    hasHdr10Plus = true;
    if (!hdrType) hdrType = "HDR10+";
  }

  // HDR10 detection
  if (lower.includes("hdr10") && !lower.includes("hdr10+")) {
    hasHdr10 = true;
    if (!hdrType) hdrType = "HDR10";
  }

  // Generic HDR detection
  if (/\bhdr\b/.test(lower) && !hasHdr10 && !hasHdr10Plus) {
    hasHdr = true;
    if (!hdrType) hdrType = "HDR";
  }

  // HLG detection
  if (lower.includes("hlg")) {
    hasHdr = true;
    if (!hdrType) hdrType = "HLG";
  }

  return { hdrType, hasDolbyVision, dvProfile, hasHdr10Plus, hasHdr10, hasHdr };
}

/**
 * Parse audio information from title
 */
function parseAudio(title: string): {
  audioCodec?: string;
  rank: number;
  hasAtmos: boolean;
  hasTrueHD: boolean;
  hasDTS: boolean;
} {
  const lower = title.toLowerCase();

  let audioCodec: string | undefined;
  let rank = 0;
  const hasAtmos = lower.includes("atmos");
  const hasTrueHD = lower.includes("truehd");
  const hasDTS = lower.includes("dts");

  // Atmos (highest priority audio)
  if (hasAtmos) {
    audioCodec = "Atmos";
    rank = 6;
  }
  // TrueHD (often paired with Atmos)
  else if (hasTrueHD) {
    audioCodec = "TrueHD";
    rank = 5;
  }
  // DTS-HD MA
  else if (lower.includes("dts-hd ma") || lower.includes("dts-hd.ma")) {
    audioCodec = "DTS-HD MA";
    rank = 5;
  }
  // DTS:X
  else if (lower.includes("dts:x") || lower.includes("dtsx")) {
    audioCodec = "DTS:X";
    rank = 5;
  }
  // DTS-HD
  else if (lower.includes("dts-hd") || lower.includes("dts.hd")) {
    audioCodec = "DTS-HD";
    rank = 4;
  }
  // Regular DTS
  else if (hasDTS) {
    audioCodec = "DTS";
    rank = 3;
  }
  // Dolby Digital Plus (E-AC3)
  else if (
    lower.includes("ddp") ||
    lower.includes("dd+") ||
    lower.includes("eac3") ||
    lower.includes("e-ac3")
  ) {
    audioCodec = "DD+";
    rank = 3;
  }
  // Dolby Digital (AC3)
  else if (
    lower.includes("dd5.1") ||
    lower.includes("ac3") ||
    lower.includes("dd 5.1")
  ) {
    audioCodec = "DD5.1";
    rank = 2;
  }
  // AAC
  else if (lower.includes("aac")) {
    audioCodec = "AAC";
    rank = 1;
  }
  // MP3
  else if (lower.includes("mp3")) {
    audioCodec = "MP3";
    rank = 0;
  }

  return { audioCodec, rank, hasAtmos, hasTrueHD, hasDTS };
}

/**
 * Parse source type from title
 */
function parseSource(title: string): {
  source: string;
  rank: number;
  isRemux: boolean;
  isBluRay: boolean;
  isWebDl: boolean;
} {
  const lower = title.toLowerCase();

  // Remux (highest quality)
  if (lower.includes("remux")) {
    return {
      source: "Remux",
      rank: 6,
      isRemux: true,
      isBluRay: true,
      isWebDl: false,
    };
  }

  // BluRay encode
  if (
    lower.includes("bluray") ||
    lower.includes("blu-ray") ||
    lower.includes("bdrip") ||
    lower.includes("brrip")
  ) {
    return {
      source: "BluRay",
      rank: 5,
      isRemux: false,
      isBluRay: true,
      isWebDl: false,
    };
  }

  // WEB-DL (direct web download)
  if (lower.includes("web-dl") || lower.includes("webdl")) {
    return {
      source: "WEB-DL",
      rank: 4,
      isRemux: false,
      isBluRay: false,
      isWebDl: true,
    };
  }

  // WEBRip (web re-encode)
  if (lower.includes("webrip") || lower.includes("web-rip")) {
    return {
      source: "WEBRip",
      rank: 3,
      isRemux: false,
      isBluRay: false,
      isWebDl: false,
    };
  }

  // HDTV
  if (lower.includes("hdtv")) {
    return {
      source: "HDTV",
      rank: 2,
      isRemux: false,
      isBluRay: false,
      isWebDl: false,
    };
  }

  // DVDRip
  if (lower.includes("dvdrip") || lower.includes("dvd-rip")) {
    return {
      source: "DVDRip",
      rank: 1,
      isRemux: false,
      isBluRay: false,
      isWebDl: false,
    };
  }

  // CAM/TS/TC (low quality)
  if (
    lower.includes("cam") ||
    lower.includes("hdcam") ||
    lower.includes("telesync") ||
    lower.includes("ts ")
  ) {
    return {
      source: "CAM",
      rank: 0,
      isRemux: false,
      isBluRay: false,
      isWebDl: false,
    };
  }

  return {
    source: "",
    rank: 0,
    isRemux: false,
    isBluRay: false,
    isWebDl: false,
  };
}

/**
 * Check for trusted release group patterns
 */
function checkTrustedRelease(title: string): {
  isTrusted: boolean;
  group?: string;
} {
  // Known trusted release groups
  const trustedGroups = [
    "SPARKS",
    "GECKOS",
    "RARBG",
    "YTS",
    "YIFY",
    "NTb",
    "FLUX",
    "TEPES",
    "BCORE",
    "CMRG",
    "SMURF",
    "HULU",
    "AMZN",
    "NF",
    "DSNP",
    "ATVP",
    "PCOK",
    "MA",
    "HMAX",
    "PROPER",
    "REPACK",
    "FGT",
    "EVO",
    "ION10",
    "CODY",
    "WEBDL",
    "NOGRP",
  ];

  for (const group of trustedGroups) {
    const regex = new RegExp(`\\b${group}\\b`, "i");
    if (regex.test(title)) {
      return { isTrusted: true, group };
    }
  }

  // Check for common patterns indicating quality releases
  if (/web-?dl/i.test(title) || /bluray/i.test(title) || /remux/i.test(title)) {
    return { isTrusted: true };
  }

  return { isTrusted: false };
}

/**
 * Parse additional quality indicators
 */
function parseExtras(title: string): {
  is3D: boolean;
  hasProperTag: boolean;
  hasRepackTag: boolean;
  isMultiAudio: boolean;
  isMultiSubs: boolean;
} {
  const lower = title.toLowerCase();

  return {
    is3D: /\b3d\b/.test(lower) || lower.includes("3d-"),
    hasProperTag: lower.includes("proper"),
    hasRepackTag: lower.includes("repack") || lower.includes("rerip"),
    isMultiAudio:
      (lower.includes("multi") && lower.includes("audio")) ||
      lower.includes("dual audio"),
    isMultiSubs: lower.includes("multi") && lower.includes("sub"),
  };
}

/**
 * Calculate overall quality score (0-100)
 */
function calculateQualityScore(
  info: Omit<ParsedTorrentInfo, "qualityScore">,
): number {
  let score = 0;

  // Resolution (0-30 points)
  score += info.resolutionRank * 6;

  // Source (0-18 points)
  score += info.sourceRank * 3;

  // Codec (0-15 points)
  score += info.codecRank * 3;

  // HDR (0-15 points)
  if (info.hasDolbyVision) score += 15;
  else if (info.hasHdr10Plus) score += 12;
  else if (info.hasHdr10) score += 10;
  else if (info.hasHdr) score += 8;

  // Audio (0-12 points)
  score += info.audioRank * 2;

  // Trusted release (0-5 points)
  if (info.isTrustedRelease) score += 5;

  // Proper/Repack bonus (0-5 points)
  if (info.hasProperTag || info.hasRepackTag) score += 5;

  return Math.min(100, score);
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse a torrent title and extract all quality information
 */
export function parseTorrentTitle(title: string): ParsedTorrentInfo {
  const resolution = parseResolution(title);
  const codec = parseCodec(title);
  const hdr = parseHDR(title);
  const audio = parseAudio(title);
  const source = parseSource(title);
  const trusted = checkTrustedRelease(title);
  const extras = parseExtras(title);

  const baseInfo = {
    resolution: resolution.resolution,
    resolutionRank: resolution.rank,
    codec: codec.codec,
    codecRank: codec.rank,
    hdrType: hdr.hdrType,
    hasDolbyVision: hdr.hasDolbyVision,
    dvProfile: hdr.dvProfile,
    hasHdr10Plus: hdr.hasHdr10Plus,
    hasHdr10: hdr.hasHdr10,
    hasHdr: hdr.hasHdr,
    audioCodec: audio.audioCodec,
    audioRank: audio.rank,
    hasAtmos: audio.hasAtmos,
    hasTrueHD: audio.hasTrueHD,
    hasDTS: audio.hasDTS,
    source: source.source,
    sourceRank: source.rank,
    isRemux: source.isRemux,
    isBluRay: source.isBluRay,
    isWebDl: source.isWebDl,
    is3D: extras.is3D,
    isHDR: hdr.hasDolbyVision || hdr.hasHdr10Plus || hdr.hasHdr10 || hdr.hasHdr,
    isTrustedRelease: trusted.isTrusted,
    releaseGroup: trusted.group,
    hasProperTag: extras.hasProperTag,
    hasRepackTag: extras.hasRepackTag,
    isMultiAudio: extras.isMultiAudio,
    isMultiSubs: extras.isMultiSubs,
  };

  return {
    ...baseInfo,
    qualityScore: calculateQualityScore(baseInfo),
  };
}

/**
 * Get a human-readable quality summary
 */
export function getQualitySummary(info: ParsedTorrentInfo): string {
  const parts: string[] = [];

  parts.push(info.resolution);

  if (info.hdrType) parts.push(info.hdrType);
  if (info.source) parts.push(info.source);
  if (info.codec) parts.push(info.codec);
  if (info.audioCodec) parts.push(info.audioCodec);

  return parts.join(" • ");
}
