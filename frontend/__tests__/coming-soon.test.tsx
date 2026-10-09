import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComingSoon } from "@/components/common/ComingSoon";
import { renderWithProviders } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("ComingSoon", () => {
  beforeEach(() => push.mockReset());

  it("shows the title, the coming-soon message and a link back to hosted zones", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ComingSoon title="Health checks" breadcrumbs={[{ text: "Health checks" }]} />,
    );
    expect(screen.getByRole("heading", { name: "Health checks" })).toBeVisible();
    expect(screen.getByTestId("coming-soon")).toHaveTextContent("This feature is coming soon.");
    await user.click(screen.getByRole("button", { name: "Back to Hosted zones" }));
    expect(push).toHaveBeenCalledWith("/hostedzones");
  });
});
