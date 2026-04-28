import { describe, expect, it, vi } from "vitest";
import { createAlertController, normalizeAlertEvent } from "../overlay/js/alert-runtime.js";

function createFakeDom() {
  return {
    root: {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
      style: {
        setProperty: vi.fn(),
      },
    },
    kicker: { textContent: "" },
    title: { textContent: "" },
    message: { textContent: "" },
    meta: { textContent: "" },
    status: { textContent: "Alert: idle" },
  };
}

describe("alert runtime", () => {
  it("normalizes donation events", () => {
    expect(
      normalizeAlertEvent({
        id: "donation-1",
        type: "donation.received",
        actor: { displayName: "ViewerName" },
        payload: {
          amount: 12.5,
          currency: "USD",
          message: "Great stream",
        },
      }),
    ).toMatchObject({
      id: "donation-1",
      type: "donation.received",
      kicker: "Donation",
      title: "ViewerName",
      message: "Great stream",
      meta: "$12.50",
    });
  });

  it("normalizes generic alert events", () => {
    expect(
      normalizeAlertEvent({
        type: "alert.begin",
        actor: { name: "viewername" },
        payload: {
          category: "Follow",
          title: "New follower",
          message: "viewername followed",
          meta: "twitch",
        },
      }),
    ).toMatchObject({
      type: "alert.begin",
      kicker: "Follow",
      title: "New follower",
      message: "viewername followed",
      meta: "twitch",
    });
  });

  it("applies alert packets to the DOM controller", () => {
    const dom = createFakeDom();
    const controller = createAlertController(dom, { debug: vi.fn() });

    expect(
      controller.handlePacket({
        type: "alert.begin",
        payload: { title: "Raid", message: "Incoming!" },
      }),
    ).toBe(true);

    expect(dom.root.classList.remove).toHaveBeenCalledWith("alert-idle");
    expect(dom.title.textContent).toBe("Raid");
    expect(dom.message.textContent).toBe("Incoming!");
    expect(dom.status.textContent).toBe("Alert: alert.begin");
  });
});
