import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";

const Navbar = ({ isLoggedIn }) => {
  const location = useLocation();

  // Don't show Navbar on landing page
  if (location.pathname === "/") return null;

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Link to="/">My Mangrove App</Link>
      </div>
      <ul className="navbar-links">
        {isLoggedIn ? (
          <>
            <li>
              <Link to="/upload">Upload</Link>
            </li>
            <li>
              <Link to="/admin">Admin</Link>
            </li>
            <li>
              <Link to="/auth">Logout</Link>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to="/auth">Login</Link>
            </li>
            <li>
              <Link to="/auth">Register</Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
};

export default Navbar;
