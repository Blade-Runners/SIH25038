import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./LoginRegisterPage.css";

const LoginRegisterPage = ({ setIsLoggedIn }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    privatekey: "",
  });
  const [error, setError] = useState("");
  const [registrationKey, setRegistrationKey] = useState(null);
  const navigate = useNavigate();

  const toggleForm = () => setIsLogin(!isLogin);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setRegistrationKey(null);

    try {
      const endpoint = isLogin ? "/auth" : "/register";
      console.log(formData.email);
      console.log(formData.password);

      const response = await fetch(`http://localhost:5000/v1${endpoint}`, {
      	method: 'POST',
      	body:JSON.stringify({
      		"email":`${formData.email}`,
      		"password":`${formData.password}`
      	})
      });

      const data = response.data;

      if (data.success) {
        if (isLogin) {
          localStorage.setItem('user', JSON.stringify(data.user));
          setIsLoggedIn(true);
          navigate("/upload"); // redirect to protected page
        } else {
          setRegistrationKey(data.user.privatekey); // show private key
        }
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Server error. Please try again later."
      );
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>{isLogin ? "Login" : "Register"}</h2>

        {registrationKey ? (
          <div className="registration-success">
            <h3>Registration Successful!</h3>
            <p>Please save your private key. You will need it to log in.</p>
            <div className="private-key-box">
              <code>{registrationKey}</code>
            </div>
            <button
              onClick={() => {
                setRegistrationKey(null);
                setIsLogin(true);
                setFormData({
                  name: "",
                  email: "",
                  password: "",
                  privatekey: "",
                });
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
              
              {isLogin && (
                <input
                  type="text"
                  name="privatekey"
                  placeholder="Private Key"
                  value={formData.privatekey}
                  onChange={handleChange}
                />
              )}
              <button type="submit">{isLogin ? "Login" : "Register"}</button>
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
