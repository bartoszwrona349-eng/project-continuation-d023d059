import { describe, expect, it } from "vitest";
import { parseSlots } from "@/lib/week";

describe("parseSlots", () => {
  it("keeps every selected day as a separate range, sorted", () => {
    const raw = "2026-10-21T10:00:00.000Z_2026-10-21T12:00:00.000Z,2026-10-20T08:00:00.000Z_2026-10-20T09:00:00.000Z";
    const r = parseSlots(raw);
    expect(r).toHaveLength(2);
    expect(r[0]!.start.toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(r[1]!.end.toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });
  it("drops invalid ranges", () => {
    expect(parseSlots("bad,2026-10-21T12:00:00.000Z_2026-10-21T10:00:00.000Z")).toHaveLength(0);
  });
});
