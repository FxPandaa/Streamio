import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components";
import {
  HomePage,
  SearchPage,
  DetailsPage,
  PlayerPage,
  LibraryPage,
  SettingsPage,
  LoginPage,
} from "./pages";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="details/:type/:id" element={<DetailsPage />} />
          <Route path="player/:type/:id" element={<PlayerPage />} />
          <Route
            path="player/:type/:id/:season/:episode"
            element={<PlayerPage />}
          />
          <Route path="library" element={<LibraryPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
