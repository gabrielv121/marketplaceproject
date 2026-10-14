import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
import App from "./App";
import "./index.css";

if (window.location.hostname === "marketplaceproject-two.vercel.app") {
  const next = new URL(window.location.href);
  next.protocol = "https:";
  next.hostname = "vrna.io";
  window.location.replace(next.toString());
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AuthProvider>
        <NotificationsProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NotificationsProvider>
      </AuthProvider>
    </StrictMode>,
  );
}
