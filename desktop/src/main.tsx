import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { migrateLocalStorage } from "./utils/storageMigration";

// One-time migration from "streamio-*" to "vreamio-*" localStorage keys
migrateLocalStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
