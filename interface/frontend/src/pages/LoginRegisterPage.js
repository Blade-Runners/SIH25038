import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginRegisterPage.css";

const LoginRegisterPage = ({ setIsLoggedIn }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Added loading state
  const [registrationKey, setRegistrationKey] = useState(null);
  const navigate = useNavigate();

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setError(""); // Clear errors when toggling
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    setRegistrationKey(null);

    const endpoint = isLogin ? "/auth" : "/register";

    const body = {
      email: formData.email,
      password: formData.password,
    };
    if (!isLogin) {
      body.name = formData.name;
    }

    try {
      const response = await fetch(`http://localhost:5000/v1${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        credentials: 'include'
      });

      if (response.ok) {
        setIsLoggedIn(true);
        if (isLogin) {
          const loginData = await response.json(); // Read the response body

          // Check for the specific "Admin login" message
          if (loginData.message === 'Admin login') {
            navigate("/admin"); // Navigate to the admin page
          } else {
            navigate("/upload"); // Navigate to the regular user page
          }
        } else {
          // For successful registration, navigate to the default page
          navigate("/upload");
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || "An error occurred.");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Server is not responding. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>{isLogin ? "Login" : "Register"}</h2>

        {registrationKey ? (
          <div className="registration-success">
            <h3>Registration Successful!</h3>
            <button
              onClick={() => {
                setRegistrationKey(null);
                setIsLogin(true);
                setFormData({ name: "", email: "", password: "" });
              }}
              className="proceed-button"
            >
              Proceed to Login
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <input
                  type="text"
                  name="name"
                  placeholder="Username"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              )}
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isLoading}
              />

              <button type="submit" disabled={isLoading}>
                {isLoading ? "Submitting..." : (isLogin ? "Login" : "Register")}
              </button>
            </form>

            {error && <p className="error">{error}</p>}

            <p onClick={toggleForm} className="toggle-link">
              {isLogin
                ? "Don’t have an account? Register"
                : "Already have an account? Login"}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginRegisterPage;