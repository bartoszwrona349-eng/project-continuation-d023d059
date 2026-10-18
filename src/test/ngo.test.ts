import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), select: vi.fn(), order: vi.fn(), eq: vi.fn(), not: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
import { filterNgoNames, loadNgoAccess } from "@/lib/ngo";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ order: mocks.order, not: mocks.not });
  mocks.not.mockResolvedValue({ data: [], error: null });
});
describe("NGO access", () => {
  it("scopes the ordinary user's profile to their own latest organization", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.order.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ data: [{ organization: "Moje NGO" }, { organization: "Poprzednie NGO" }], error: null });
    expect(await loadNgoAccess("owner-1")).toEqual({ isAdmin: false, names: ["Moje NGO"] });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner-1");
  });
  it("lists unique organizations for administrators", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.order.mockResolvedValue({ data: [{ organization: "NGO B" }, { organization: "NGO A" }, { organization: "NGO B" }], error: null });
    expect(await loadNgoAccess("admin-1")).toEqual({ isAdmin: true, names: ["NGO A", "NGO B"] });
    expect(mocks.eq).not.toHaveBeenCalled();
  });
  it("searches organizations ignoring case and surrounding whitespace", () => {
    expect(filterNgoNames(["Fundacja Pomoc", "NGO Sport"], " POMOC ")).toEqual(["Fundacja Pomoc"]);
  });
  it("does not return organizations if the role check fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Denied") });
    await expect(loadNgoAccess("owner-1")).rejects.toThrow("Denied");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
import { normalizeKrs, ngoPlUrl, ngoRegistryUrl } from "@/lib/ngo";
import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("KRS", () => {
  i2("accepts 10 digits, ignoring spaces", () => e2(normalizeKrs("0000 123 456")).toBe("0000123456"));
  i2("rejects wrong length", () => e2(normalizeKrs("12345")).toBeNull());
  i2("no ngo.pl link without KRS", () => e2(ngoPlUrl(null)).toBeNull());
  i2("uses the ngo.pl search parameter and retains the full KRS", () => {
    e2(ngoPlUrl("0000019652")).toBe("https://szukaj.ngo.pl/?search=0000019652");
  });
  i2("links directly to the organization in Rejestr.io using numeric KRS", () => {
    e2(ngoRegistryUrl("0000019652")).toBe("https://rejestr.io/krs/19652");
  });
  i2("does not create a registry link for missing or invalid KRS", () => {
    for (const krs of [null, "", "12345", "0000000000"]) e2(ngoRegistryUrl(krs)).toBeNull();
  });
});
