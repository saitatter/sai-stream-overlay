import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSceneController,
  createSceneStatusEvent,
  normalizeInlineFragmentShader,
  resolveSceneFragmentShader,
} from "../overlay/js/scene-runtime.js";

const originalFetch = global.fetch;

function createFakeDom() {
  const createClassList = () => ({
    toggle: vi.fn(),
  });

  return {
    canvas: {
      classList: createClassList(),
    },
    content: {
      classList: createClassList(),
    },
    kicker: {
      textContent: "",
    },
    title: {
      textContent: "",
    },
    subtitle: {
      textContent: "",
    },
    countdown: {
      textContent: "",
    },
    status: {
      textContent: "Scene: idle",
    },
  };
}

function createFakeRenderer(shaderResult) {
  return {
    setFragmentShader: vi.fn(() => shaderResult),
    setParameters: vi.fn(),
    setActive: vi.fn(),
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("scene runtime shader resolution", () => {
  it("uses an inline payload fragmentShader before the manifest shader", () => {
    const resolved = resolveSceneFragmentShader(
      {
        fragmentShader: "precision highp float; void main() { gl_FragColor = vec4(1.0); }",
      },
      {
        fragmentShader: "manifest shader",
      },
    );

    expect(resolved).toEqual({
      source: "precision highp float; void main() { gl_FragColor = vec4(1.0); }",
      sourceType: "inline",
    });
  });

  it("falls back to the manifest shader when the payload omits fragmentShader", () => {
    expect(resolveSceneFragmentShader({}, { fragmentShader: "manifest shader" })).toEqual({
      source: "manifest shader",
      sourceType: "manifest",
    });
  });

  it("ignores blank and oversized inline shaders", () => {
    expect(normalizeInlineFragmentShader("   ")).toBe("");
    expect(normalizeInlineFragmentShader("x".repeat(50001))).toBe("");
  });
});

describe("createSceneStatusEvent", () => {
  it("creates a normalized scene.status payload for moderation/event hubs", () => {
    const event = createSceneStatusEvent({
      instance: "main",
      sceneKey: "starting-soon",
      lifecycle: "compile-error",
      severity: "error",
      message: "Scene shader compilation failed; previous shader remains active.",
      detail: "ERROR: 0:1: syntax error",
      shaderSource: "inline",
    });

    expect(event).toEqual({
      version: 1,
      type: "scene.status",
      source: "overlay",
      status: "system",
      createdAt: expect.any(String),
      target: {
        overlay: "scene",
        instance: "main",
      },
      payload: {
        sceneKey: "starting-soon",
        lifecycle: "compile-error",
        severity: "error",
        message: "Scene shader compilation failed; previous shader remains active.",
        detail: "ERROR: 0:1: syntax error",
        shaderSource: "inline",
      },
    });
  });
});

describe("createSceneController", () => {
  it("emits only compile-error and skips scene application when shader compilation fails", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ defaults: {} }),
    }));
    const dom = createFakeDom();
    const renderer = createFakeRenderer({
      ok: false,
      error: "ERROR: 0:1: syntax error",
    });
    const emitted = [];
    const controller = createSceneController(
      dom,
      renderer,
      "main",
      "scenes",
      {
        warn: vi.fn(),
        debug: vi.fn(),
      },
      (event) => emitted.push(event),
    );

    await controller.setScene({
      sceneKey: "broken-scene",
      title: "Broken Scene",
      fragmentShader: "not valid glsl",
    });

    expect(emitted.map((event) => event.payload.lifecycle)).toEqual(["compile-error"]);
    expect(dom.title.textContent).toBe("");
    expect(dom.status.textContent).toBe("Scene: idle");
    expect(renderer.setActive).not.toHaveBeenCalled();
    expect(renderer.setParameters).not.toHaveBeenCalled();
  });

  it("does not emit idle when returning to idle fails shader compilation", async () => {
    const dom = createFakeDom();
    const renderer = createFakeRenderer({
      ok: false,
      error: "ERROR: 0:1: syntax error",
    });
    const emitted = [];
    const controller = createSceneController(
      dom,
      renderer,
      "main",
      "scenes",
      {
        warn: vi.fn(),
        debug: vi.fn(),
      },
      (event) => emitted.push(event),
    );

    await controller.setScene({
      sceneKey: "idle",
      fragmentShader: "not valid glsl",
    });

    expect(emitted.map((event) => event.payload.lifecycle)).toEqual(["compile-error"]);
    expect(dom.status.textContent).toBe("Scene: idle");
    expect(renderer.setActive).not.toHaveBeenCalled();
    expect(renderer.setParameters).not.toHaveBeenCalled();
  });
});
