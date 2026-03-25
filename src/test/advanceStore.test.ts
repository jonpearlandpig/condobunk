import { describe, it, expect, beforeEach } from "vitest";
import { useAdvanceStore } from "@/stores/advanceStore";

describe("useAdvanceStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    useAdvanceStore.setState({ selectedShowId: null });
  });

  it("initializes with null selectedShowId", () => {
    expect(useAdvanceStore.getState().selectedShowId).toBeNull();
  });

  it("sets selectedShowId", () => {
    useAdvanceStore.getState().setSelectedShowId("show-abc");
    expect(useAdvanceStore.getState().selectedShowId).toBe("show-abc");
  });

  it("clears selectedShowId", () => {
    useAdvanceStore.getState().setSelectedShowId("show-abc");
    useAdvanceStore.getState().setSelectedShowId(null);
    expect(useAdvanceStore.getState().selectedShowId).toBeNull();
  });

  it("overwrites selectedShowId", () => {
    useAdvanceStore.getState().setSelectedShowId("show-1");
    useAdvanceStore.getState().setSelectedShowId("show-2");
    expect(useAdvanceStore.getState().selectedShowId).toBe("show-2");
  });
});
