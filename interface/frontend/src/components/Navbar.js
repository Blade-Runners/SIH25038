import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";

const Navbar = ({ isLoggedIn }) => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Don't show Navbar on landing page
  if (location.pathname === "/") return null;

  const toggleMenu = () => setMenuOpen(!menuOpen);

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Link to="/">My Mangrove App</Link>
      </div>

      <button className="mobile-menu-btn" onClick={toggleMenu}>
        ☰
      </button>

      <ul className={`navbar-links ${menuOpen ? "show" : ""}`}>
        {isLoggedIn ? (
          <>
            <li>
              <Link to="/upload" onClick={() => setMenuOpen(false)}>Upload</Link>
            </li>
            <li>
              <Link to="/admin" onClick={() => setMenuOpen(false)}>Admin</Link>
            </li>
            <li>
              <Link to="/auth" onClick={() => setMenuOpen(false)}>Logout</Link>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to="/auth" onClick={() => setMenuOpen(false)}>Login</Link>
            </li>
            <li>
              <Link to="/auth" onClick={() => setMenuOpen(false)}>Register</Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
};

export default Navbar;
