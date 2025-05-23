import { describe, it, expect } from "vitest";
// No longer need to mock import.meta.env globally for buildUrl
// import { vi } from 'vitest'; // Only if other mocks are needed

import { buildUrl } from "../lib/backend"; 

describe("buildUrl", () => {
  const MOCKED_BASE_URL = "https://api.example.com/api";
  const MOCKED_BASE_URL_WITH_SLASH = "https://api.example.com/api/";
  const MOCKED_BASE_URL_NO_API = "https://api.example.com";

  it("should correctly append a path starting with a slash", () => {
    expect(buildUrl("/users", MOCKED_BASE_URL)).toBe(
      "https://api.example.com/api/users"
    );
  });

  it("should correctly append a path not starting with a slash", () => {
    expect(buildUrl("products", MOCKED_BASE_URL)).toBe(
      "https://api.example.com/api/products"
    );
  });

  it("should handle an empty path", () => {
    // Current backend.js logic for empty path: const suffix = path.startsWith("/") ? path : `/${path}`;
    // If path is '', suffix becomes '/'. So, 'https://api.example.com/api/'
    expect(buildUrl("", MOCKED_BASE_URL)).toBe("https://api.example.com/api/");
  });

  it("should handle a base URL ending with a slash and path starting with a slash (avoid double slash)", () => {
    expect(buildUrl("/items", MOCKED_BASE_URL_WITH_SLASH)).toBe(
      "https://api.example.com/api/items"
    );
  });

  it("should handle a base URL ending with a slash and path NOT starting with a slash", () => {
    expect(buildUrl("items", MOCKED_BASE_URL_WITH_SLASH)).toBe(
      "https://api.example.com/api/items"
    );
  });

  it("should handle a base URL not ending with a slash and path not starting with a slash", () => {
    expect(buildUrl("path", MOCKED_BASE_URL_NO_API)).toBe(
      "https://api.example.com/path"
    );
  });

  it("should handle a base URL not ending with a slash and path starting with a slash", () => {
    expect(buildUrl("/path", MOCKED_BASE_URL_NO_API)).toBe(
      "https://api.example.com/path"
    );
  });

  it("should handle undefined path by treating it as empty string effectively", () => {
    // Based on revised buildUrl: (String(path).startsWith("/") ... )
    // String(undefined) is "undefined"
    // String(null) is "null"
    // The new logic for suffix: path === undefined || path === null ? '' : ...
    // So, for undefined or null path, suffix becomes '', and url is just the base.
    expect(buildUrl(undefined, MOCKED_BASE_URL)).toBe(
      "https://api.example.com/api"
    );
  });

  it("should handle null path by treating it as empty string effectively", () => {
    expect(buildUrl(null, MOCKED_BASE_URL)).toBe("https://api.example.com/api");
  });

  it("should throw an error if baseUrl is not provided and VITE_BACKEND_URL is also missing/undefined", () => {
    // This requires that DEFAULT_API_BASE_URL in backend.js is undefined.
    // Vitest by default doesn't set import.meta.env variables unless explicitly mocked.
    // So, calling buildUrl() without the second argument should trigger the error if VITE_BACKEND_URL isn't mocked here.
    // For this test, we are testing the refactored code path where baseUrl is explicitly passed,
    // so testing the fallback to DEFAULT_API_BASE_URL requires a different setup.
    // The refactoring makes buildUrl directly testable without relying on import.meta.env for the *unit test*.
    // To test the fallback logic itself, one would need to mock DEFAULT_API_BASE_URL to be undefined.
    // For now, we confirm that passing an undefined baseUrl explicitly also fails if the default is also missing.
    // This test is more about the explicit baseUrl parameter.
    expect(() => buildUrl("/test", undefined)).toThrow(
      "API base URL is not configured"
    );
  });
});
