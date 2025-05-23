import {
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      sizes: [512],
      padding: 0.15,
      resizeOptions: {
        background: "#064e3b",
      },
    },
    apple: {
      sizes: [180],
      padding: 0.15,
      resizeOptions: {
        background: "#064e3b",
      },
    },
  },
  images: ["public/app-icon.svg"],
});
