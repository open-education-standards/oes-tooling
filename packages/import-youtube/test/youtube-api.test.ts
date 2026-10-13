import { describe, expect, it, vi } from "vitest";
import { fetchYoutubePlaylist, YoutubeApiError, type FetchLike } from "../src/youtube-api.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Routes a mock fetch by which YouTube endpoint the request URL targets. */
function mockFetch(handlers: {
  playlists?: (url: URL) => Response;
  playlistItems?: (url: URL) => Response;
  videos?: (url: URL) => Response;
}): FetchLike {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/playlists")) return handlers.playlists!(url);
    if (url.pathname.endsWith("/playlistItems")) return handlers.playlistItems!(url);
    if (url.pathname.endsWith("/videos")) return handlers.videos!(url);
    throw new Error(`Unhandled mock request: ${url}`);
  });
  return fn as unknown as FetchLike;
}

describe("fetchYoutubePlaylist", () => {
  it("fetches playlist metadata and every video, in playlist order", async () => {
    const fetchImpl = mockFetch({
      playlists: () =>
        jsonResponse({ items: [{ snippet: { title: "My Playlist", description: "desc" } }] }),
      playlistItems: () =>
        jsonResponse({
          items: [
            { contentDetails: { videoId: "vid1" } },
            { contentDetails: { videoId: "vid2" } },
          ],
        }),
      videos: (url) => {
        expect(url.searchParams.get("id")).toBe("vid1,vid2");
        return jsonResponse({
          items: [
            {
              id: "vid1",
              snippet: { title: "Video One", description: "0:00 Intro\n1:00 Middle" },
              contentDetails: { duration: "PT10M" },
            },
            {
              id: "vid2",
              snippet: { title: "Video Two", description: "" },
              contentDetails: { duration: "PT5M30S" },
            },
          ],
        });
      },
    });

    const result = await fetchYoutubePlaylist(
      "https://www.youtube.com/playlist?list=PLtestPlaylistId1234",
      "test-key",
      fetchImpl,
    );

    expect(result.playlistId).toBe("PLtestPlaylistId1234");
    expect(result.title).toBe("My Playlist");
    expect(result.videos).toHaveLength(2);
    expect(result.videos[0]).toMatchObject({ videoId: "vid1", title: "Video One", durationSeconds: 600 });
    expect(result.videos[0].chapters).toEqual([
      { label: "Intro", time_seconds: 0 },
      { label: "Middle", time_seconds: 60 },
    ]);
    expect(result.videos[1]).toMatchObject({ videoId: "vid2", title: "Video Two", durationSeconds: 330 });
  });

  it("paginates playlistItems via nextPageToken", async () => {
    let call = 0;
    const fetchImpl = mockFetch({
      playlists: () => jsonResponse({ items: [{ snippet: { title: "Paginated" } }] }),
      playlistItems: () => {
        call++;
        if (call === 1) {
          return jsonResponse({
            items: [{ contentDetails: { videoId: "vidA" } }],
            nextPageToken: "page2",
          });
        }
        return jsonResponse({ items: [{ contentDetails: { videoId: "vidB" } }] });
      },
      videos: () =>
        jsonResponse({
          items: [
            { id: "vidA", snippet: { title: "A" } },
            { id: "vidB", snippet: { title: "B" } },
          ],
        }),
    });

    const result = await fetchYoutubePlaylist("PLtestPlaylistId1234", "test-key", fetchImpl);
    expect(result.videos.map((v) => v.videoId)).toEqual(["vidA", "vidB"]);
    expect(call).toBe(2);
  });

  it("skips playlist items for deleted/private videos with no returned details", async () => {
    const fetchImpl = mockFetch({
      playlists: () => jsonResponse({ items: [{ snippet: { title: "Has gaps" } }] }),
      playlistItems: () =>
        jsonResponse({
          items: [
            { contentDetails: { videoId: "alive" } },
            { contentDetails: { videoId: "deleted" } },
          ],
        }),
      // videos.list simply omits ids that no longer exist.
      videos: () => jsonResponse({ items: [{ id: "alive", snippet: { title: "Still here" } }] }),
    });

    const result = await fetchYoutubePlaylist("PLtestPlaylistId1234", "test-key", fetchImpl);
    expect(result.videos.map((v) => v.videoId)).toEqual(["alive"]);
  });

  it("throws YoutubeApiError with status 404 when the playlist doesn't exist", async () => {
    const fetchImpl = mockFetch({
      playlists: () => jsonResponse({ items: [] }),
    });

    await expect(fetchYoutubePlaylist("PLmissingPlaylistId1234", "test-key", fetchImpl)).rejects.toMatchObject({
      name: "YoutubeApiError",
      status: 404,
    });
  });

  it("throws YoutubeApiError with status 403 on a denied/quota-exceeded request", async () => {
    const fetchImpl = mockFetch({
      playlists: () => jsonResponse({ error: "quota exceeded" }, 403),
    });

    await expect(fetchYoutubePlaylist("PLtestPlaylistId1234", "bad-key", fetchImpl)).rejects.toBeInstanceOf(YoutubeApiError);
  });

  it("throws a plain Error for input with no extractable playlist id", async () => {
    const fetchImpl = mockFetch({});
    await expect(fetchYoutubePlaylist("not a url or id", "key", fetchImpl)).rejects.toThrow(/playlist id/);
  });
});
