import { useRef, useState } from "react";
import type { VideoHTMLAttributes } from "react";
import type { OvfChapter, OvfVideo } from "@inklyre/oes-core";

export interface VideoPlayerProps {
  video: OvfVideo;
  /**
   * Passed through to the underlying `<video>` element, applied after the
   * defaults below — so `videoProps` can override `src`/`controls`/
   * `className`/anything else, not just add attributes.
   */
  videoProps?: VideoHTMLAttributes<HTMLVideoElement>;
  /**
   * Resolves a caption track's relative `path` (for example against the
   * URL of the bundle the video came from). Without it, only `url`
   * captions are used.
   */
  resolveUrl?: (url: string) => string;
}

/** The video id of a YouTube watch, short or embed URL, or undefined. */
export function youtubeId(url: string): string | undefined {
  const m = url.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m?.[1];
}

/**
 * Renders one OVF video lesson: the video itself, plus a chapter list
 * that seeks the player on click when `chapters` is present. Only
 * `captions[].url` entries become `<track>`s — a `path` is relative to
 * this video's own `video.json` and has no meaning without the
 * `ContentSource` that resolved it, which this component deliberately
 * never sees (see the package README's data-contract note). Resolve a
 * `path` caption to an absolute URL yourself before passing `video` in,
 * if you need it rendered.
 */
export function VideoPlayer({ video, videoProps, resolveUrl }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtube = youtubeId(video.video_url);
  const [start, setStart] = useState<number | undefined>(undefined);

  const seekTo = (chapter: OvfChapter): void => {
    if (youtube) setStart(chapter.time_seconds);
    else if (videoRef.current) videoRef.current.currentTime = chapter.time_seconds;
  };

  const urlCaptions = (video.captions ?? []).flatMap((caption) => {
    if (typeof caption.url === "string") return [{ language: caption.language, url: caption.url }];
    if (typeof caption.path === "string" && resolveUrl) return [{ language: caption.language, url: resolveUrl(caption.path) }];
    return [];
  });

  return (
    <div className="oes-video-player">
      {youtube ? (
        <iframe
          className="oes-video-player__embed"
          // A chapter click reloads the embed at that time; start is part of the key so it does.
          key={start ?? 0}
          src={`https://www.youtube-nocookie.com/embed/${youtube}${start !== undefined ? `?start=${start}&autoplay=1` : ""}`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <video ref={videoRef} className="oes-video-player__video" src={video.video_url} controls {...videoProps}>
          {urlCaptions.map((caption) => (
            <track key={caption.language} kind="captions" srcLang={caption.language} src={caption.url} />
          ))}
        </video>
      )}
      {video.chapters && video.chapters.length > 0 && (
        <ol className="oes-video-player__chapters">
          {video.chapters.map((chapter) => (
            <li key={`${chapter.time_seconds}-${chapter.label}`} className="oes-video-player__chapter">
              <button
                type="button"
                className="oes-video-player__chapter-button"
                onClick={() => seekTo(chapter)}
              >
                {chapter.label}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
