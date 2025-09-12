import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginRegisterPage.css";

const LoginRegisterPage = ({ setIsLoggedIn }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const toggleForm = () => setIsLogin(!isLogin);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const endpoint = isLogin ? "/login" : "/register";
      const response = await fetch(`http://localhost:5000/api/user${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 👈 send & receive cookies
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        setIsLoggedIn(true);
        navigate("/upload"); // redirect to protected page
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch (err) {
      setError("Server error. Please try again later.");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>{isLogin ? "Login" : "Register"}</h2>
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              type="text"
              name="name"
              placeholder="Username"
              value={formData.name}
              onChange={handleChange}
              required
            />
          )}
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <button type="submit">{isLogin ? "Login" : "Register"}</button>
        </form>
        {error && <p className="error">{error}</p>}
        <p onClick={toggleForm} className="toggle-link">
          {isLogin ? "Don’t have an account? Register" : "Already have an account? Login"}
        </p>
      </div>
    </div>
  );
};

export default LoginRegisterPage;
