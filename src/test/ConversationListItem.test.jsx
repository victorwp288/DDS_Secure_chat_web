import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationListItem } from "../components/ChatSidebar/ConversationListItem";

describe("ConversationListItem", () => {
  const mockProps = {
    conversation: {
      id: "conv-1",
      name: "John Doe",
      lastMessage: "Hello there!",
      time: "10:30",
      unread: 2,
      avatar: "john.jpg",
      is_group: false,
      my_status: "accepted",
    },
    isSelected: false,
    onClick: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render conversation details correctly", () => {
    render(<ConversationListItem {...mockProps} />);

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Hello there!")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("should display unread count when there are unread messages", () => {
    render(<ConversationListItem {...mockProps} />);

    const unreadBadge = screen.getByText("2");
    expect(unreadBadge).toBeInTheDocument();
    expect(unreadBadge).toHaveClass("bg-emerald-500");
  });

  it("should not display unread count when there are no unread messages", () => {
    const propsWithoutUnread = {
      ...mockProps,
      conversation: { ...mockProps.conversation, unread: 0 },
    };

    render(<ConversationListItem {...propsWithoutUnread} />);

    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("should show selected styling when conversation is selected", () => {
    const selectedProps = { ...mockProps, isSelected: true };

    render(<ConversationListItem {...selectedProps} />);

    // Use data-testid or class-based selection to find the root container
    const container = document.querySelector(".p-3.rounded-lg.cursor-pointer");
    expect(container).toHaveClass("bg-slate-700");
  });

  it("should not show selected styling when conversation is not selected", () => {
    render(<ConversationListItem {...mockProps} />);

    const container = document.querySelector(".p-3.rounded-lg.cursor-pointer");
    expect(container).not.toHaveClass("bg-slate-700");
  });

  it("should call onClick when conversation is clicked", () => {
    render(<ConversationListItem {...mockProps} />);

    const conversationItem = document.querySelector(
      ".p-3.rounded-lg.cursor-pointer"
    );
    fireEvent.click(conversationItem);

    expect(mockProps.onClick).toHaveBeenCalledTimes(1);
  });

  it("should display accept and reject buttons for pending conversations", () => {
    const pendingProps = {
      ...mockProps,
      conversation: { ...mockProps.conversation, my_status: "pending" },
    };

    render(<ConversationListItem {...pendingProps} />);

    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("should not display accept and reject buttons for accepted conversations", () => {
    render(<ConversationListItem {...mockProps} />);

    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
  });

  it("should call onAccept when accept button is clicked", () => {
    const pendingProps = {
      ...mockProps,
      conversation: { ...mockProps.conversation, my_status: "pending" },
    };

    render(<ConversationListItem {...pendingProps} />);

    const acceptButton = screen.getByText("Accept");
    fireEvent.click(acceptButton);

    expect(mockProps.onAccept).toHaveBeenCalledWith("conv-1");
    expect(mockProps.onClick).not.toHaveBeenCalled(); // Should not trigger main click
  });

  it("should call onReject when reject button is clicked", () => {
    const pendingProps = {
      ...mockProps,
      conversation: { ...mockProps.conversation, my_status: "pending" },
    };

    render(<ConversationListItem {...pendingProps} />);

    const rejectButton = screen.getByText("Reject");
    fireEvent.click(rejectButton);

    expect(mockProps.onReject).toHaveBeenCalledWith("conv-1");
    expect(mockProps.onClick).not.toHaveBeenCalled(); // Should not trigger main click
  });

  it("should display group avatar for group conversations", () => {
    const groupProps = {
      ...mockProps,
      conversation: {
        ...mockProps.conversation,
        is_group: true,
        group_name: "Team Chat",
        group_avatar_url: "group.jpg",
      },
    };

    render(<ConversationListItem {...groupProps} />);

    // Check for avatar container using data-slot attribute
    expect(document.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it("should display individual avatar for individual conversations", () => {
    render(<ConversationListItem {...mockProps} />);

    // Check for avatar container using data-slot attribute
    expect(document.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it("should use placeholder avatar when no avatar is provided", () => {
    const propsWithoutAvatar = {
      ...mockProps,
      conversation: { ...mockProps.conversation, avatar: null },
    };

    render(<ConversationListItem {...propsWithoutAvatar} />);

    // Avatar should still be rendered
    expect(document.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it("should display initials in avatar fallback", () => {
    render(<ConversationListItem {...mockProps} />);

    const avatarFallback = screen.getByText("JD");
    expect(avatarFallback).toBeInTheDocument();
    expect(avatarFallback).toHaveClass("bg-emerald-500");
  });

  it("should handle group name display correctly", () => {
    const groupProps = {
      ...mockProps,
      conversation: {
        ...mockProps.conversation,
        is_group: true,
        group_name: "Team Chat",
      },
    };

    render(<ConversationListItem {...groupProps} />);

    expect(screen.getByText("Team Chat")).toBeInTheDocument();
  });

  it("should handle unnamed group gracefully", () => {
    const unnamedGroupProps = {
      ...mockProps,
      conversation: {
        ...mockProps.conversation,
        is_group: true,
        group_name: null,
      },
    };

    render(<ConversationListItem {...unnamedGroupProps} />);

    expect(screen.getByText("Unnamed Group")).toBeInTheDocument();
  });

  it("should truncate long names correctly", () => {
    const longNameProps = {
      ...mockProps,
      conversation: {
        ...mockProps.conversation,
        name: "This is a very long conversation name that should be truncated",
      },
    };

    render(<ConversationListItem {...longNameProps} />);

    const nameElement = screen.getByText(
      "This is a very long conversation name that should be truncated"
    );
    expect(nameElement).toHaveClass("truncate");
  });

  it("should truncate long last messages correctly", () => {
    const longMessageProps = {
      ...mockProps,
      conversation: {
        ...mockProps.conversation,
        lastMessage:
          "This is a very long last message that should be truncated to prevent layout issues",
      },
    };

    render(<ConversationListItem {...longMessageProps} />);

    const messageElement = screen.getByText(
      "This is a very long last message that should be truncated to prevent layout issues"
    );
    expect(messageElement).toHaveClass("truncate");
  });

  it("should handle empty or undefined names gracefully", () => {
    const emptyNameProps = {
      ...mockProps,
      conversation: { ...mockProps.conversation, name: "" },
    };

    render(<ConversationListItem {...emptyNameProps} />);

    // Should still render the component without errors
    expect(screen.getByText("??")).toBeInTheDocument(); // Fallback initials
  });

  it("should handle hover effects", () => {
    render(<ConversationListItem {...mockProps} />);

    const conversationItem = document.querySelector(
      ".p-3.rounded-lg.cursor-pointer"
    );
    expect(conversationItem).toHaveClass("hover:bg-slate-700/50");
  });

  it("should handle button styling for accept/reject buttons", () => {
    const pendingProps = {
      ...mockProps,
      conversation: { ...mockProps.conversation, my_status: "pending" },
    };

    render(<ConversationListItem {...pendingProps} />);

    const acceptButton = screen.getByText("Accept");
    const rejectButton = screen.getByText("Reject");

    expect(acceptButton).toHaveClass("bg-green-500", "hover:bg-green-600");
    expect(rejectButton).toHaveClass("bg-red-500", "hover:bg-red-600");
  });

  it("should display correct time format", () => {
    const timeProps = {
      ...mockProps,
      conversation: { ...mockProps.conversation, time: "Yesterday" },
    };

    render(<ConversationListItem {...timeProps} />);

    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toHaveClass("text-slate-400");
  });

  it("should handle large unread counts", () => {
    const largeUnreadProps = {
      ...mockProps,
      conversation: { ...mockProps.conversation, unread: 999 },
    };

    render(<ConversationListItem {...largeUnreadProps} />);

    const unreadBadge = screen.getByText("999");
    expect(unreadBadge).toBeInTheDocument();
    expect(unreadBadge).toHaveClass("rounded-full");
  });

  it("should handle group avatar placeholder correctly", () => {
    const groupWithoutAvatarProps = {
      ...mockProps,
      conversation: {
        ...mockProps.conversation,
        is_group: true,
        group_name: "Team",
        group_avatar_url: null,
      },
    };

    render(<ConversationListItem {...groupWithoutAvatarProps} />);

    // Avatar should still be rendered with fallback
    expect(document.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });
});
