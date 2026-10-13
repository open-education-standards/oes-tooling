import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OvfVideo } from "@inklyre/oes-core";
import { VideoPlayer } from "../src/VideoPlayer.js";

afterEach(cleanup);

const baseVideo: OvfVideo = {
  ovf_version: "0.1.0",
  id: "intro",
  title: "Introduction",
  video_url: "https://example.com/intro.mp4",
};

describe("VideoPlayer", () => {
  it("renders the video element with the given src", () => {
    const { container } = render(<VideoPlayer video={baseVideo} />);
    const videoEl = container.querySelector("video");
    expect(videoEl).not.toBeNull();
    expect(videoEl?.getAttribute("src")).toBe("https://example.com/intro.mp4");
  });

  it("renders no chapter list when there are no chapters", () => {
    const { container } = render(<VideoPlayer video={baseVideo} />);
    expect(container.querySelector(".oes-video-player__chapters")).toBeNull();
  });

  it("renders a chapter button per chapter and seeks on click", () => {
    const video: OvfVideo = {
      ...baseVideo,
      chapters: [
        { label: "Setup", time_seconds: 0 },
        { label: "Deep dive", time_seconds: 90 },
      ],
    };
    const { container } = render(<VideoPlayer video={video} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Setup", "Deep dive"]);

    const videoEl = container.querySelector("video") as HTMLVideoElement;
    fireEvent.click(buttons[1]);
    expect(videoEl.currentTime).toBe(90);
  });

  it("renders a <track> only for url-based captions, skipping path-based ones", () => {
    const video: OvfVideo = {
      ...baseVideo,
      captions: [
        { language: "en", url: "https://example.com/en.vtt" },
        { language: "es", path: "es.vtt" },
      ],
    };
    const { container } = render(<VideoPlayer video={video} />);
    const tracks = container.querySelectorAll("track");
    expect(tracks.length).toBe(1);
    expect(tracks[0].getAttribute("srclang")).toBe("en");
  });

  it("lets videoProps override defaults", () => {
    const { container } = render(<VideoPlayer video={baseVideo} videoProps={{ controls: false, muted: true }} />);
    const videoEl = container.querySelector("video");
    expect(videoEl?.hasAttribute("controls")).toBe(false);
    expect((videoEl as HTMLVideoElement).muted).toBe(true);
  });
});
