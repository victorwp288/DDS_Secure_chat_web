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
      name: /About the project/i,
    });
    expect(headingElement).toBeInTheDocument();

    // Check for some paragraph text
    const paragraphElement = screen.getByText(
      /The project is based on end to end message encryption/i
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
    // Note: The original AboutPage.jsx has some inconsistencies in how team members are listed (some with titles, some without, some text-gray-800)
    // These tests will reflect what's currently rendered.
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
    // Original component has "Our Mission" then "Our project", and "Meet the Team" then "The group:"
    // Testing for the latter ones as they are the visible h2 headings for those sections after changes.
    expect(
      screen.getByRole("heading", { name: /Our project/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /The group:/i })
    ).toBeInTheDocument();
  });
});
