import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useProfileStore } from "../stores/profileStore";
import "./Layout.css";

export function Layout() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const activeProfile = useProfileStore(
    (s) => s.profiles.find((p) => p.id === s.activeProfileId) || null,
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const isPlayer = location.pathname.startsWith("/player");

  return (
    <div className={`layout${isPlayer ? " layout--player" : ""}`}>
      <header className={`header${isPlayer ? " header--hidden" : ""}`}>
        <nav className="nav">
          <NavLink to="/" className="logo">
            <span className="logo-icon">▶</span>
            <span className="logo-text">Vreamio</span>
          </NavLink>

          <div className="nav-links">
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/library"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Library
            </NavLink>
          </div>

          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              className="search-input"
              placeholder="Search movies & TV shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>

          <div className="nav-right">
            <NavLink to="/settings" className="settings-btn">
              ⚙️
            </NavLink>

            {activeProfile && (
              <NavLink
                to="/profiles"
                className="profile-nav-btn"
                title={activeProfile.name}
              >
                <span
                  className="profile-nav-avatar"
                  style={{ background: activeProfile.avatarColor }}
                >
                  {activeProfile.avatarIcon}
                </span>
              </NavLink>
            )}

            {isAuthenticated ? (
              <div className="user-menu">
                <span className="user-name">{user?.username}</span>
                <button onClick={handleLogout} className="logout-btn">
                  Logout
                </button>
              </div>
            ) : (
              <NavLink to="/login" className="header-login-btn">
                Sign In
              </NavLink>
            )}
          </div>
        </nav>
      </header>

      <main className="main-content">
        <div key={location.pathname} className="route-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
