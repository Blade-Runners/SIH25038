import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginRegisterPage.css";

const LoginRegisterPage = ({ isLoggedIn, setIsLoggedIn }) => {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const toggleForm = () => setIsLogin(!isLogin);

  const handleSubmit = (e) => {
    e.preventDefault();
    // ✅ Accept any credentials
    setIsLoggedIn(true); // simulate login
    navigate("/upload"); // redirect to protected page after login
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>{isLogin ? "Login" : "Register"}</h2>
        <form onSubmit={handleSubmit}>
          {!isLogin && <input type="text" placeholder="Username" required />}
          <input type="email" placeholder="Email" required />
          <input type="password" placeholder="Password" required />
          <button type="submit">{isLogin ? "Login" : "Register"}</button>
        </form>
        <p onClick={toggleForm} className="toggle-link">
          {isLogin ? "Don’t have an account? Register" : "Already have an account? Login"}
        </p>
      </div>
    </div>
  );
};

export default LoginRegisterPage;
