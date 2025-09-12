import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import UploadForm from './pages/UploadForm';
import AdminDashboard from './pages/AdminDashboard';
import LandingPage from "./components/LandingPage";
import LoginRegisterPage from "./pages/LoginRegisterPage";
import Navbar from "./components/Navbar";
import './App.css';

// Wrapper component to handle conditional navbar
const AppWrapper = () => {
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const PrivateRoute = ({ element }) => {
    return isLoggedIn ? element : <Navigate to="/auth" replace />;
  };

  // ✅ Show navbar only if path is NOT "/" or "/auth"
  const showNavbar = location.pathname !== "/" && location.pathname !== "/auth";

  return (
    <>
      {showNavbar && <Navbar isLoggedIn={isLoggedIn} />}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/auth"
          element={<LoginRegisterPage isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn} />}
        />
        <Route path="/upload" element={<PrivateRoute element={<UploadForm />} />} />
        <Route path="/admin" element={<PrivateRoute element={<AdminDashboard />} />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <Router>
      <AppWrapper />
    </Router>
  );
}

export default App;
