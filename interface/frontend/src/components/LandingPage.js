import React from "react";
import { useNavigate, Link } from "react-router-dom";
import "./LandingPage.css";

const LandingPage = () => {
  const navigate = useNavigate();

  const backgroundStyle = {
    backgroundImage: `url("landing-mangrove.jpg")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    minHeight: "100vh",
  };

  return (
    <div className="landing-container" style={backgroundStyle}>
      {/* Navbar */}
      <nav className="navbar">
        <h1>
          <i>
            BLUE LEDGER
          </i>
        </h1>
        <div className="nav-links">
          <Link to="/auth">Login / Register</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-text-overlay">
          <div className="hero-text">
            <h1>Blockchain-based Blue Carbon Registry</h1>
            <p>
              A transparent and secure MRV system for protecting the
              <strong> Sundarbans Mangrove Forest</strong>.
            </p>
            <button onClick={() => navigate("/auth")}>Get Started</button>
          </div>
        </div>
        {/* <div className="hero-image">
          <img src="sundarbans.jpg" alt="Mangrove Forest" />
        </div> */}
      </section>
    </div>
  );
};

export default LandingPage;
