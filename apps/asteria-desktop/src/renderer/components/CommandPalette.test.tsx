import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "./CommandPalette.js";

const baseCommands = [
  {
    id: "cmd-projects",
    label: "Go to Projects",
    category: "Navigation",
    shortcut: "Ctrl+1",
    action: vi.fn(),
  },
  {
    id: "cmd-run",
    label: "Start New Run",
    category: "Actions",
    action: vi.fn(),
  },
];

describe("CommandPalette", () => {
  it("renders commands and handles selection", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<CommandPalette isOpen onClose={onClose} commands={baseCommands} />);

    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText(/Go to Projects/i)).toBeInTheDocument();
    expect(screen.getByText(/Start New Run/i)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+1/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /go to projects/i }));

    expect(baseCommands[0].action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when no commands match", async () => {
    const user = userEvent.setup();

    render(<CommandPalette isOpen onClose={() => {}} commands={baseCommands} />);

    await user.type(screen.getAllByRole("textbox", { name: /command search/i })[0], "zzz");

    expect(screen.getByText(/no commands found/i)).toBeInTheDocument();
  });

  it("supports keyboard navigation and execution", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const commands = [
      { ...baseCommands[0], action: vi.fn() },
      { ...baseCommands[1], action: vi.fn() },
    ];

    render(<CommandPalette isOpen onClose={onClose} commands={commands} />);

    const first = screen.getByRole("button", { name: /go to projects/i });
    const second = screen.getByRole("button", { name: /start new run/i });

    expect(first).toHaveAttribute("aria-current", "true");

    await user.keyboard("{ArrowDown}");
    expect(second).toHaveAttribute("aria-current", "true");

    await user.keyboard("{Enter}");
    expect(commands[1].action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{ArrowUp}");
    expect(first).toHaveAttribute("aria-current", "true");
  });
});
