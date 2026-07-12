import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import packageJson from "../package.json";
import "./index.css";

document.title = `Musical v${packageJson.version}`;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
