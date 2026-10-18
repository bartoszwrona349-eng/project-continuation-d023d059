import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, order };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

vi.mock("@/lib/session", () => ({
  useSession: () => ({ user: { id: "u-1", email: "org@example.org" }, session: null, loading: false }),
  useIsAdmin: () => false,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    Link: ({ children, ...rest }: { children?: React.ReactNode; to?: unknown }) => (
      <a href={String(rest.to ?? "#")}>{children}</a>
    ),
  };
});

import { MyRequests } from "@/routes/_authenticated/moje-wnioski";

const OWN = {
  id: "b-1",
  event_name: "próba",
  organization: "test",
  status: "approved",
  kind: "request",
  start_at: "2030-01-15T07:00:00.000Z",
  end_at: "2030-01-15T09:00:00.000Z",
  participants: 50,
  venues: { name: "Sala Kameralna" },
};
const REJECTED = { ...OWN, id: "b-2", event_name: "xas", status: "rejected" };

function renderPage(rows: unknown[]) {
  mocks.order.mockResolvedValue({ data: rows, error: null });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MyRequests />
    </QueryClientProvider>,
  );
}

describe("Moje wnioski", () => {
  it("loads only requests belonging to the signed-in user", async () => {
    renderPage([OWN, REJECTED]);

    await waitFor(() => expect(screen.getByText("próba")).toBeInTheDocument());

    expect(mocks.from).toHaveBeenCalledWith("bookings");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "u-1");
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("venues(name)"));
  });

  it("keeps requests of other users out of the list", async () => {
    renderPage([REJECTED]);

    await waitFor(() => expect(screen.getByText("xas")).toBeInTheDocument());
    expect(screen.queryByText("próba")).not.toBeInTheDocument();
  });

  it("filters the list by status", async () => {
    renderPage([OWN, REJECTED]);
    await waitFor(() => expect(screen.getByText("próba")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Odrzucone/ }));

    await waitFor(() => expect(screen.queryByText("próba")).not.toBeInTheDocument());
    expect(screen.getByText("xas")).toBeInTheDocument();
  });

  it("points the user to the calendar when nothing was submitted yet", async () => {
    renderPage([]);

    await waitFor(() => expect(screen.getByText(/Nie złożyłeś jeszcze żadnego wniosku/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Przejdź do kalendarza" })).toHaveAttribute("href", "/");
  });
});
