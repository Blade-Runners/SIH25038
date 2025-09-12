import React, { useState } from 'react';
import SubmissionCard from '../components/SubmissionCard';
import './AdminDashboard.css';

const initialSubmissions = [
  {
    id: 1,
    name: 'Ravi Kumar',
    location: 'Sundarbans, West Bengal',
    imageUrl: 'img1.jpg',
    status: 'Pending',
  },
  {
    id: 2,
    name: 'Asha Devi',
    location: 'Sundarbans',
    imageUrl: 'img2.jpeg',
    status: 'Pending',
  },
];

function AdminDashboard() {
  const [submissions, setSubmissions] = useState(initialSubmissions);

  const handleApprove = (id) => {
    setSubmissions((prev) =>
      prev.map((sub) =>
        sub.id === id ? { ...sub, status: 'Approved' } : sub
      )
    );
  };

  const handleReject = (id) => {
    setSubmissions((prev) =>
      prev.map((sub) =>
        sub.id === id ? { ...sub, status: 'Rejected' } : sub
      )
    );
  };

  return (
    <div className="admin-container">
      <h2>Admin Dashboard</h2>
      <div className="card-grid">
        {submissions.map((submission) => (
          <SubmissionCard
            key={submission.id}
            submission={submission}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
      </div>
    </div>
  );
}

export default AdminDashboard;
