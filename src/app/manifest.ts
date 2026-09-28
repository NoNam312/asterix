import type { MetadataRoute } from "next";

// Lets the app be installed ("Add to Home Screen") and open full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QuestLog",
    short_name: "QuestLog",
    description: "A gamified daily planner: turn your tasks into quests and earn XP.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
