import { useRef } from "react";
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
export function VideoPlayer({ video, videoProps }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const seekTo = (chapter: OvfChapter): void => {
    if (videoRef.current) videoRef.current.currentTime = chapter.time_seconds;
  };

  const urlCaptions = (video.captions ?? []).filter(
    (caption): caption is typeof caption & { url: string } => typeof caption.url === "string",
  );

  return (
    <div className="oes-video-player">
      <video ref={videoRef} className="oes-video-player__video" src={video.video_url} controls {...videoProps}>
        {urlCaptions.map((caption) => (
          <track key={caption.language} kind="captions" srcLang={caption.language} src={caption.url} />
        ))}
      </video>
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
