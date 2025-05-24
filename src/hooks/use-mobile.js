import { useState, useEffect } from "react";

// Function to update viewport height for mobile browsers
const updateViewportHeight = () => {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
};

export const useMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768); // Adjust breakpoint as needed
      updateViewportHeight(); // Update viewport height on resize
    };

    // Set initial values
    handleResize();

    // Listen for window resize events
    window.addEventListener("resize", handleResize);

    // Listen for orientationchange on mobile devices
    window.addEventListener("orientationchange", () => {
      // Delay to allow orientation change to complete
      setTimeout(updateViewportHeight, 100);
    });

    // Clean up event listeners on unmount
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", updateViewportHeight);
    };
  }, []);

  return isMobile;
};
