import { extractChapters } from "./chapters.js";
import { parseIso8601Duration } from "./duration.js";
import { extractPlaylistId } from "./parse-url.js";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 50; // YouTube's own max for both playlistItems.list and videos.list (by id batch)

export interface YoutubeVideoData {
  videoId: string;
  title: string;
  description: string;
  /** `undefined` when YouTube reports an unparseable duration (e.g. a live stream) — the caller decides how to handle it. */
  durationSeconds: number | undefined;
  thumbnailUrl: string | undefined;
  chapters: ReturnType<typeof extractChapters>;
}

export interface YoutubePlaylistData {
  playlistId: string;
  playlistUrl: string;
  title: string;
  description: string | undefined;
  videos: YoutubeVideoData[];
}

export class YoutubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

/** Injectable so tests never hit the real network — defaults to the global `fetch`. */
export type FetchLike = typeof fetch;

// Minimal shapes for the three YouTube Data API v3 endpoints this module
// calls — only the fields actually read, not the full API surface.
interface YoutubeThumbnail {
  url: string;
}

interface YoutubeSnippet {
  title?: string;
  description?: string;
  thumbnails?: { default?: YoutubeThumbnail; high?: YoutubeThumbnail };
}

interface PlaylistsListResponse {
  items?: Array<{ snippet?: YoutubeSnippet }>;
}

interface PlaylistItemsListResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  nextPageToken?: string;
}

interface VideosListResponse {
  items?: Array<{ id: string; snippet?: YoutubeSnippet; contentDetails?: { duration?: string } }>;
}

async function apiGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey);

  const res = await fetchImpl(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new YoutubeApiError(
        `YouTube API request denied (403) — check your API key and daily quota. ${body}`,
        403,
      );
    }
    if (res.status === 404) {
      throw new YoutubeApiError(`YouTube API resource not found (404): ${path}`, 404);
    }
    throw new YoutubeApiError(`YouTube API request to ${path} failed: ${res.status} ${body}`, res.status);
  }
  return res.json() as Promise<T>;
}

interface PlaylistItemRef {
  videoId: string;
}

async function fetchPlaylistItemIds(
  playlistId: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<PlaylistItemRef[]> {
  const refs: PlaylistItemRef[] = [];
  let pageToken: string | undefined;
  do {
    const page = await apiGet<PlaylistItemsListResponse>(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId,
        maxResults: String(PAGE_SIZE),
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
      fetchImpl,
    );
    for (const item of page.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      // A playlist item with no contentDetails.videoId is a deleted/private
      // video YouTube still lists a placeholder for — skip it rather than
      // failing the whole import.
      if (videoId) refs.push({ videoId });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return refs;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<Map<string, YoutubeVideoData>> {
  const byId = new Map<string, YoutubeVideoData>();
  for (const batch of chunk(videoIds, PAGE_SIZE)) {
    const page = await apiGet<VideosListResponse>(
      "videos",
      { part: "snippet,contentDetails", id: batch.join(",") },
      apiKey,
      fetchImpl,
    );
    for (const item of page.items ?? []) {
      const description: string = item.snippet?.description ?? "";
      byId.set(item.id, {
        videoId: item.id,
        title: item.snippet?.title ?? item.id,
        description,
        durationSeconds: item.contentDetails?.duration
          ? parseIso8601Duration(item.contentDetails.duration)
          : undefined,
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.default?.url ??
          undefined,
        chapters: extractChapters(description),
      });
    }
    // Batch requests for videos that no longer exist (private/deleted since
    // the playlistItems listing) simply omit that id from `page.items` —
    // no error to catch, just fewer entries in `byId` than `batch.length`.
  }
  return byId;
}

/**
 * Fetch a full playlist's metadata plus every video's metadata via the
 * YouTube Data API v3, paginating and batching as needed. Videos that were
 * deleted or made private since being added to the playlist are skipped,
 * not treated as a fatal error.
 */
export async function fetchYoutubePlaylist(
  playlistUrlOrId: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<YoutubePlaylistData> {
  const playlistId = extractPlaylistId(playlistUrlOrId);
  if (!playlistId) {
    throw new Error(
      `Could not extract a playlist id from "${playlistUrlOrId}" — expected a youtube.com/playlist?list=... URL or a bare playlist id.`,
    );
  }

  const playlistPage = await apiGet<PlaylistsListResponse>(
    "playlists",
    { part: "snippet", id: playlistId },
    apiKey,
    fetchImpl,
  );
  const playlistSnippet = playlistPage.items?.[0]?.snippet;
  if (!playlistSnippet) {
    throw new YoutubeApiError(`No playlist found for id "${playlistId}" — it may be private or deleted.`, 404);
  }

  const itemRefs = await fetchPlaylistItemIds(playlistId, apiKey, fetchImpl);
  const detailsById = await fetchVideoDetails(
    itemRefs.map((ref) => ref.videoId),
    apiKey,
    fetchImpl,
  );

  const videos: YoutubeVideoData[] = [];
  for (const ref of itemRefs) {
    const details = detailsById.get(ref.videoId);
    if (details) videos.push(details);
    // else: skipped, deleted/private video with no details available.
  }

  return {
    playlistId,
    playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    title: playlistSnippet.title ?? playlistId,
    description: playlistSnippet.description || undefined,
    videos,
  };
}
