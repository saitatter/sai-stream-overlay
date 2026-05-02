import { describe, expect, it, vi } from "vitest";
import {
  createOverlayController,
  normalizeOverlayNodePatchEvent,
  normalizeOverlayResource,
  normalizeOverlayResourceEvent,
  normalizeOverlayStatePatchEvent,
  normalizeOverlayStateSnapshotEvent,
} from "../overlay/js/overlay-runtime.js";

function createDom() {
  const root = {
    children: [],
    classList: {
      add: vi.fn(),
      toggle: vi.fn(),
    },
    appendChild: vi.fn((element) => root.children.push(element)),
    querySelectorAll: vi.fn(() => root.children),
    replaceChildren: vi.fn(() => {
      root.children = [];
    }),
    getBoundingClientRect: () => ({ width: 1920, height: 1080 }),
  };
  return {
    root,
    status: { textContent: "" },
  };
}

describe("overlay resource runtime", () => {
  it("normalizes overlay.resource.updated events", () => {
    const resource = normalizeOverlayResourceEvent({
      type: "overlay.resource.updated",
      payload: {
        resource: {
          key: "main-alerts",
          name: "Main Alerts",
          target: { instance: "main" },
          size: { width: 1920, height: 1080 },
          nodes: [
            {
              id: "latest-follower-label",
              type: "label",
              binding: "platform.twitch.latestFollower.displayName",
              x: 96,
              y: 820,
              width: 520,
              height: 72,
              style: { color: "#fff", fontSize: 42 },
            },
          ],
        },
      },
    });

    expect(resource).toMatchObject({
      key: "main-alerts",
      target: { instance: "main" },
      nodes: [
        {
          id: "latest-follower-label",
          type: "label",
          binding: "platform.twitch.latestFollower.displayName",
          style: { color: "#fff", fontSize: 42 },
        },
      ],
    });
  });

  it("renders labels and panels into the DOM", () => {
    const elements = [];
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const element = {
          className: "",
          dataset: {},
          style: {},
          textContent: "",
        };
        elements.push(element);
        return element;
      }),
    });
    const dom = createDom();
    const controller = createOverlayController({
      dom,
      instance: "main",
      logger: { debug: vi.fn() },
    });

    controller.applyResource(
      normalizeOverlayResource({
        key: "main-alerts",
        target: { instance: "main" },
        size: { width: 1920, height: 1080 },
        nodes: [
          {
            id: "panel-1",
            type: "panel",
            x: 50,
            y: 60,
            width: 400,
            height: 120,
            style: { backgroundColor: "#111827", opacity: 0.7 },
          },
          {
            id: "label-1",
            type: "label",
            text: "Latest follower",
            x: 80,
            y: 90,
            width: 320,
            height: 80,
            style: { color: "#ffffff" },
          },
        ],
      }),
    );

    expect(dom.root.replaceChildren).toHaveBeenCalled();
    expect(dom.root.appendChild).toHaveBeenCalledTimes(2);
    expect(elements[0].className).toContain("overlay-node-panel");
    expect(elements[1].textContent).toBe("Latest follower");
    expect(dom.status.textContent).toBe("Overlay: main-alerts");
  });

  it("applies overlay.state.patch events to bound labels", () => {
    const elements = [];
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const element = {
          className: "",
          dataset: {},
          style: {},
          textContent: "",
        };
        elements.push(element);
        return element;
      }),
    });
    const dom = createDom();
    const controller = createOverlayController({
      dom,
      instance: "main",
      logger: { debug: vi.fn() },
    });
    controller.applyResource(
      normalizeOverlayResource({
        key: "main-alerts",
        target: { instance: "main" },
        size: { width: 1920, height: 1080 },
        nodes: [
          {
            id: "label-1",
            type: "label",
            binding: "platform.twitch.latestFollower.displayName",
            text: "Waiting",
            x: 80,
            y: 90,
            width: 320,
            height: 80,
            style: { color: "#ffffff" },
          },
        ],
      }),
    );

    const patch = normalizeOverlayStatePatchEvent({
      type: "overlay.state.patch",
      target: { instance: "main" },
      payload: {
        path: "platform.twitch.latestFollower.displayName",
        value: "ViewerName",
      },
    });
    expect(controller.applyStatePatch(patch)).toBe(true);

    expect(elements[0].textContent).toBe("ViewerName");
    expect(dom.status.textContent).toBe(
      "Overlay state: platform.twitch.latestFollower.displayName",
    );
  });

  it("ignores resources for other instances", () => {
    const dom = createDom();
    const controller = createOverlayController({
      dom,
      instance: "main",
      logger: { debug: vi.fn() },
    });

    expect(
      controller.applyResource(
        normalizeOverlayResource({
          key: "other-overlay",
          target: { instance: "secondary" },
          nodes: [{ id: "label-1", type: "label", text: "Wrong instance" }],
        }),
      ),
    ).toBe(false);

    expect(dom.root.appendChild).not.toHaveBeenCalled();
  });

  it("applies nested state snapshots to bound labels", () => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        className: "",
        dataset: {},
        style: {},
        textContent: "",
      })),
    });
    const dom = createDom();
    const controller = createOverlayController({
      dom,
      instance: "main",
      logger: { debug: vi.fn() },
    });
    controller.applyResource(
      normalizeOverlayResource({
        key: "main-alerts",
        target: { instance: "main" },
        nodes: [
          {
            id: "label-1",
            type: "label",
            binding: "platform.twitch.latestFollower.displayName",
            text: "Waiting",
          },
        ],
      }),
    );

    controller.applyStateSnapshot(
      normalizeOverlayStateSnapshotEvent({
        type: "overlay.state.snapshot",
        target: { instance: "main" },
        payload: {
          state: {
            platform: {
              twitch: {
                latestFollower: {
                  displayName: "SnapshotViewer",
                },
              },
            },
          },
        },
      }),
    );

    expect(dom.root.children[0].textContent).toBe("SnapshotViewer");
  });

  it("applies batch state patches", () => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        className: "",
        dataset: {},
        style: {},
        textContent: "",
      })),
    });
    const dom = createDom();
    const controller = createOverlayController({
      dom,
      instance: "main",
      logger: { debug: vi.fn() },
    });
    controller.applyResource(
      normalizeOverlayResource({
        key: "main-alerts",
        target: { instance: "main" },
        nodes: [
          { id: "label-1", type: "label", binding: "labels.first", text: "One" },
          { id: "label-2", type: "label", binding: "labels.second", text: "Two" },
        ],
      }),
    );

    controller.applyStatePatch(
      normalizeOverlayStatePatchEvent({
        type: "overlay.state.patch",
        target: { instance: "main" },
        payload: {
          patches: [
            { path: "labels.first", value: "First" },
            { path: "labels.second", value: "Second" },
          ],
        },
      }),
    );

    expect(dom.root.children[0].textContent).toBe("First");
    expect(dom.root.children[1].textContent).toBe("Second");
  });

  it("applies node patches without replacing unspecified style values", () => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        className: "",
        dataset: {},
        style: {},
        textContent: "",
      })),
    });
    const dom = createDom();
    const controller = createOverlayController({
      dom,
      instance: "main",
      logger: { debug: vi.fn() },
    });
    controller.applyResource(
      normalizeOverlayResource({
        key: "main-alerts",
        target: { instance: "main" },
        nodes: [
          {
            id: "label-1",
            type: "label",
            text: "Before",
            style: { color: "#ffffff", fontSize: 40 },
          },
        ],
      }),
    );

    controller.applyNodePatch(
      normalizeOverlayNodePatchEvent({
        type: "overlay.node.patch",
        target: { instance: "main" },
        payload: {
          nodeId: "label-1",
          patch: {
            text: "After",
            style: { color: "#ff0000" },
          },
        },
      }),
    );

    expect(dom.root.children[0].textContent).toBe("After");
    expect(dom.root.children[0].style.color).toBe("#ff0000");
    expect(dom.root.children[0].style.fontSize).toBe("40px");
  });

  it("renders shader nodes with a fallback when WebGL is unavailable", () => {
    vi.stubGlobal("document", {
      createElement: vi.fn((tagName) => {
        const classes = [];
        return {
          className: "",
          children: [],
          dataset: {},
          style: {},
          textContent: "",
          classList: {
            add: vi.fn((className) => classes.push(className)),
            contains: vi.fn((className) => classes.includes(className)),
          },
          appendChild(child) {
            this.children.push(child);
          },
          getContext: tagName === "canvas" ? vi.fn(() => null) : undefined,
        };
      }),
    });
    const dom = createDom();
    const controller = createOverlayController({
      dom,
      instance: "main",
      logger: { debug: vi.fn(), warn: vi.fn() },
    });

    controller.applyResource(
      normalizeOverlayResource({
        key: "shader-overlay",
        target: { instance: "main" },
        nodes: [{ id: "shader-1", type: "shader", width: 400, height: 300 }],
      }),
    );

    expect(dom.root.children[0].children[0].className).toBe("overlay-shader-canvas");
    expect(dom.root.children[0].classList.contains("overlay-node-shader-fallback")).toBe(true);
  });
});
