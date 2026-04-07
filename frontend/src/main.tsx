import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../node_modules/@douyinfe/semi-ui/dist/css/semi.min.css";
import "./semi-theme.css";
import App from "./App";
import SemiAppProvider from "./providers/SemiAppProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SemiAppProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SemiAppProvider>
  </React.StrictMode>
);
