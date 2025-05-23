import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBox } from "../components/ChatSidebar/SearchBox";

describe("SearchBox", () => {
  const mockOnSearchChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render search input with placeholder", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    const input = screen.getByPlaceholderText("Search conversations...");
    expect(input).toBeInTheDocument();
  });

  it("should display search icon", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    // The Search icon should be present
    const searchIcon = document.querySelector("svg");
    expect(searchIcon).toBeInTheDocument();
  });

  it("should display current search query value", () => {
    const searchQuery = "test query";
    render(
      <SearchBox
        searchQuery={searchQuery}
        onSearchChange={mockOnSearchChange}
      />
    );

    const input = screen.getByPlaceholderText("Search conversations...");
    expect(input).toHaveValue(searchQuery);
  });

  it("should call onSearchChange when typing", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    const input = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(input, { target: { value: "new search" } });

    expect(mockOnSearchChange).toHaveBeenCalledWith("new search");
    expect(mockOnSearchChange).toHaveBeenCalledTimes(1);
  });

  it("should call onSearchChange when clearing search", () => {
    render(
      <SearchBox searchQuery="existing" onSearchChange={mockOnSearchChange} />
    );

    const input = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(input, { target: { value: "" } });

    expect(mockOnSearchChange).toHaveBeenCalledWith("");
    expect(mockOnSearchChange).toHaveBeenCalledTimes(1);
  });

  it("should have correct styling classes", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    const input = screen.getByPlaceholderText("Search conversations...");
    expect(input).toHaveClass(
      "pl-9",
      "bg-slate-700",
      "border-slate-600",
      "text-slate-200",
      "placeholder:text-slate-400"
    );
  });

  it("should have search icon positioned correctly", () => {
    const { container } = render(
      <SearchBox searchQuery="" onSearchChange={vi.fn()} />
    );

    // Check if the icon has the correct positioning classes
    const icon = container.querySelector("svg");
    expect(icon).toHaveClass(
      "absolute",
      "left-3",
      "top-1/2",
      "transform",
      "-translate-y-1/2"
    );
  });

  it("should have correct padding to accommodate search icon", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    const container = screen.getByRole("textbox").closest(".p-4");
    expect(container).toHaveClass("p-4", "border-b", "border-slate-700");
  });

  it("should handle special characters in search query", () => {
    const specialQuery = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    render(
      <SearchBox
        searchQuery={specialQuery}
        onSearchChange={mockOnSearchChange}
      />
    );

    const input = screen.getByPlaceholderText("Search conversations...");
    expect(input).toHaveValue(specialQuery);
  });

  it("should handle unicode characters in search query", () => {
    const unicodeQuery = "🔍 Hello 世界";
    render(
      <SearchBox
        searchQuery={unicodeQuery}
        onSearchChange={mockOnSearchChange}
      />
    );

    const input = screen.getByPlaceholderText("Search conversations...");
    expect(input).toHaveValue(unicodeQuery);
  });

  it("should handle long search queries", () => {
    const longQuery = "a".repeat(1000);
    render(
      <SearchBox searchQuery={longQuery} onSearchChange={mockOnSearchChange} />
    );

    const input = screen.getByPlaceholderText("Search conversations...");
    expect(input).toHaveValue(longQuery);
  });

  it("should call onSearchChange multiple times during typing", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    const input = screen.getByPlaceholderText("Search conversations...");

    fireEvent.change(input, { target: { value: "h" } });
    fireEvent.change(input, { target: { value: "he" } });
    fireEvent.change(input, { target: { value: "hel" } });
    fireEvent.change(input, { target: { value: "hello" } });

    expect(mockOnSearchChange).toHaveBeenCalledTimes(4);
    expect(mockOnSearchChange).toHaveBeenNthCalledWith(1, "h");
    expect(mockOnSearchChange).toHaveBeenNthCalledWith(2, "he");
    expect(mockOnSearchChange).toHaveBeenNthCalledWith(3, "hel");
    expect(mockOnSearchChange).toHaveBeenNthCalledWith(4, "hello");
  });

  it("should be focusable", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    const input = screen.getByPlaceholderText("Search conversations...");
    input.focus();
    expect(input).toHaveFocus();
  });

  it("should respond to keyboard events", () => {
    render(<SearchBox searchQuery="" onSearchChange={mockOnSearchChange} />);

    const input = screen.getByPlaceholderText("Search conversations...");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });

    // The component should handle these events gracefully (no errors)
    expect(input).toBeInTheDocument();
  });
});
