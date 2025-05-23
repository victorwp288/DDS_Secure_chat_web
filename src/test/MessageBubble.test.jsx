import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "../components/ChatWindow/MessageBubble";

describe("MessageBubble", () => {
  const mockMessage = {
    id: "msg-1",
    senderId: "user-1",
    senderName: "John Doe",
    senderAvatar: "avatar.jpg",
    content: "Hello, how are you?",
    timestamp: "10:30",
    isSelf: false,
  };

  it("should render message content correctly", () => {
    render(<MessageBubble message={mockMessage} />);

    expect(screen.getByText("Hello, how are you?")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("should display sender name and avatar for non-self messages", () => {
    render(<MessageBubble message={mockMessage} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it("should not display sender name and avatar for self messages", () => {
    const selfMessage = {
      ...mockMessage,
      isSelf: true,
    };

    render(<MessageBubble message={selfMessage} />);

    expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="avatar"]')
    ).not.toBeInTheDocument();
  });

  it("should apply correct styling for self messages", () => {
    const selfMessage = {
      ...mockMessage,
      isSelf: true,
    };

    render(<MessageBubble message={selfMessage} />);

    const messageContainer = screen
      .getByText("Hello, how are you?")
      .closest("div");
    expect(messageContainer).toHaveClass("bg-emerald-500", "rounded-tr-none");
  });

  it("should apply correct styling for other messages", () => {
    render(<MessageBubble message={mockMessage} />);

    const messageContainer = screen
      .getByText("Hello, how are you?")
      .closest("div");
    expect(messageContainer).toHaveClass("bg-slate-700", "rounded-tl-none");
  });

  it("should render file download link for file messages with URL", () => {
    const fileMessage = {
      ...mockMessage,
      content: "[File](https://example.com/file.pdf) document.pdf",
    };

    render(<MessageBubble message={fileMessage} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/file.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("📎 document.pdf");
  });

  it("should render file indicator for file messages without URL", () => {
    const fileMessage = {
      ...mockMessage,
      content: "[File] document.pdf",
    };

    render(<MessageBubble message={fileMessage} />);

    expect(screen.getByText("📎 document.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("should handle missing sender avatar gracefully", () => {
    const messageWithoutAvatar = {
      ...mockMessage,
      senderAvatar: null,
    };

    render(<MessageBubble message={messageWithoutAvatar} />);

    expect(document.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it("should display initials fallback when avatar fails to load", () => {
    render(<MessageBubble message={mockMessage} />);

    const avatarFallback = screen.getByText("JD");
    expect(avatarFallback).toBeInTheDocument();
  });

  it("should handle empty sender name gracefully", () => {
    const messageWithoutName = {
      ...mockMessage,
      senderName: "",
    };

    render(<MessageBubble message={messageWithoutName} />);

    const avatarFallback = screen.getByText("??");
    expect(avatarFallback).toBeInTheDocument();
  });

  it("should align timestamp correctly for self messages", () => {
    const selfMessage = {
      ...mockMessage,
      isSelf: true,
    };

    render(<MessageBubble message={selfMessage} />);

    const timestamp = screen.getByText("10:30");
    expect(timestamp).toHaveClass("text-right");
  });

  it("should align timestamp correctly for other messages", () => {
    render(<MessageBubble message={mockMessage} />);

    const timestamp = screen.getByText("10:30");
    expect(timestamp).toHaveClass("text-left");
  });

  it("should handle single name initials", () => {
    const singleNameMessage = {
      ...mockMessage,
      senderName: "Alice",
    };

    render(<MessageBubble message={singleNameMessage} />);

    const avatarFallback = screen.getByText("A");
    expect(avatarFallback).toBeInTheDocument();
  });

  it("should handle three-word names correctly", () => {
    const threeWordNameMessage = {
      ...mockMessage,
      senderName: "John Michael Doe",
    };

    render(<MessageBubble message={threeWordNameMessage} />);

    const avatarFallback = screen.getByText("JMD");
    expect(avatarFallback).toBeInTheDocument();
  });

  it("should render message bubble with correct container alignment", () => {
    render(<MessageBubble message={mockMessage} />);

    const outerContainer = screen
      .getByText("Hello, how are you?")
      .closest("div").parentElement.parentElement;
    expect(outerContainer).toHaveClass("justify-start");
  });

  it("should render self message bubble with correct container alignment", () => {
    const selfMessage = {
      ...mockMessage,
      isSelf: true,
    };

    render(<MessageBubble message={selfMessage} />);

    const outerContainer = screen
      .getByText("Hello, how are you?")
      .closest("div").parentElement.parentElement;
    expect(outerContainer).toHaveClass("justify-end");
  });

  it("should limit message width to 80%", () => {
    render(<MessageBubble message={mockMessage} />);

    const messageContent = screen
      .getByText("Hello, how are you?")
      .closest("div").parentElement;
    expect(messageContent).toHaveClass("max-w-[80%]");
  });

  it("should handle file URL with spaces in filename", () => {
    const fileMessage = {
      ...mockMessage,
      content:
        "[File](https://example.com/file.pdf) my document with spaces.pdf",
    };

    render(<MessageBubble message={fileMessage} />);

    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("📎 my document with spaces.pdf");
  });

  it("should handle malformed file content gracefully", () => {
    const malformedFileMessage = {
      ...mockMessage,
      content: "[File](incomplete",
    };

    render(<MessageBubble message={malformedFileMessage} />);

    // The regex will still match and create a link, but without a proper href
    const link = document.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent("📎 Download File");
  });
});
