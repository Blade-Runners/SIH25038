import React from 'react';
import './SubmissionCard.css';

function SubmissionCard({ submission, onApprove, onReject }) {
  return (
    <div className="submission-card">
      <img src={submission.imageUrl} alt="Mangrove" />
      <div className="submission-info">
        <h3>{submission.name}</h3>
        <p><strong>Location:</strong> {submission.location}</p>
        <p><strong>Status:</strong> {submission.status}</p>
        <div className="submission-actions">
          <button className="approve" onClick={() => onApprove(submission.id)}>Approve</button>
          <button className="reject" onClick={() => onReject(submission.id)}>Reject</button>
        </div>
      </div>
    </div>
  );
}

export default SubmissionCard;
