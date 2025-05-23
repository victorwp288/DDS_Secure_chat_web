import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom"; // Needed if the component uses Link or other router features
import AboutPage from "../pages/AboutPage";

describe("AboutPage", () => {
  it("should render the AboutPage correctly", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );

    // Check for the main heading
    const headingElement = screen.getByRole("heading", {
      name: /About SecureChat/i,
    });
    expect(headingElement).toBeInTheDocument();

    // Check for some paragraph text
    const paragraphElement = screen.getByText(
      /A cutting-edge end-to-end encrypted messaging platform/i
    );
    expect(paragraphElement).toBeInTheDocument();

    // Check for the "Back to Home" link
    const backLink = screen.getByRole("link", { name: /Back to Home/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("should render team member names", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );

    // Check for some of the team member names
    expect(
      screen.getByText("Abul Kasem Mohammed Omar Sharif")
    ).toBeInTheDocument();
    expect(screen.getByText("Mads Holt Jensen")).toBeInTheDocument();
    expect(screen.getByText("Neha Sharma")).toBeInTheDocument();
    expect(screen.getByText("Ivan Mezinov")).toBeInTheDocument();
    expect(screen.getByText("Victor Wejergang Petersen")).toBeInTheDocument();
    expect(screen.getByText("Morten Allan Jensen")).toBeInTheDocument();
  });

  it("should render section titles", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    // Check for the actual headings that exist in the component
    expect(
      screen.getByRole("heading", { name: /Our Mission/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Technical Excellence/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Development Team/i })
    ).toBeInTheDocument();
  });
});
