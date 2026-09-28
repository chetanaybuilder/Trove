import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Shared from "./Shared.jsx";
import "./index.css";
createRoot(document.getElementById("root")).render(location.pathname.startsWith("/s/") ? <Shared /> : <App />);
