import React, { useState, useEffect } from 'react';
import './AdminDashboard.css';

function AdminDashboard() {
  const [chainData, setChainData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchChainData = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/chain');
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        setChainData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchChainData();
  }, []); // Empty array ensures this runs only once on mount

  if (loading) {
    return <div className="admin-container"><h2>Loading Dashboard...</h2></div>;
  }

  if (error) {
    return <div className="admin-container"><h2>Error: {error}</h2></div>;
  }

  return (
    <div className="admin-container">
      <h2>Admin Dashboard</h2>
      {chainData && (
        <div className="dashboard-grid">
          {/* Stats Card */}
          <div className="dashboard-card">
            <h3>Blockchain Statistics</h3>
            <ul className="stats-list">
              {Object.entries(chainData.stats).map(([key, value]) => (
                <li key={key}>
                  <span>{key.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
                  <strong>{value}</strong>
                </li>
              ))}
            </ul>
          </div>

          {/* Peers Card */}
          <div className="dashboard-card">
            <h3>Peer Network</h3>
            <ul className="stats-list">
              <li>
                <span>CONNECTED</span>
                <strong>{chainData.peers.connected}</strong>
              </li>
              <li>
                <span>TOTAL</span>
                <strong>{chainData.peers.total}</strong>
              </li>
            </ul>
          </div>

          {/* Config Card */}
          <div className="dashboard-card">
            <h3>Node Configuration</h3>
            <ul className="stats-list">
              {Object.entries(chainData.config).map(([key, value]) => (
                <li key={key}>
                  <span>{key.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
                  <strong>{value}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;