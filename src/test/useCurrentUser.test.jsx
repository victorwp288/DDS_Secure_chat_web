import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// Mock dependencies before imports
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: null },
          error: null,
        })
      ),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

vi.mock("../lib/signalContext.jsx", () => ({
  useSignal: () => ({
    signalStore: {},
    deviceId: 1,
    isReady: true,
  }),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
});

import { useCurrentUser } from "../hooks/useCurrentUser";

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }) => <BrowserRouter>{children}</BrowserRouter>;

  it("should initialize with loading state", () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.currentUser).toBe(null);
    expect(result.current.profile).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it("should provide setError function", () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    expect(typeof result.current.setError).toBe("function");
  });

  it("should provide handleLogout function", () => {
    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    expect(typeof result.current.handleLogout).toBe("function");
  });
});
