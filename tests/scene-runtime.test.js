import { describe, expect, it } from "vitest";
import {
  createSceneStatusEvent,
  normalizeInlineFragmentShader,
  resolveSceneFragmentShader,
} from "../overlay/js/scene-runtime.js";

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
        instance: "main",
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
