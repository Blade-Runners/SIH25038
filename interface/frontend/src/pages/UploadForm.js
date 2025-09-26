import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UploadForm.css';
import Cookies from 'js-cookie';

function UploadForm() {
  // Form data
  const [formData, setFormData] = useState({
    address: '',
    location: { latitude: '', longitude: '' },
    area: '',
    shape: 'rectangle',
    type: 'restoration',
    speciesData: 'Mangrove',
  });

  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState({ message: '', type: '' });

  // User info from cookies
  const [user, setUser] = useState({ uuid: '', privatekey: '' });

  // Fetch user cookies on mount
  useEffect(() => {
    const uuid = Cookies.get('uuid');
    const privatekey = Cookies.get('privatekey');
    if (uuid && privatekey) setUser({ uuid, privatekey });
  }, []);

  // Get live location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setFormData((prev) => ({
            ...prev,
            location: { latitude: latitude.toFixed(5), longitude: longitude.toFixed(5) },
          }));
          setIsLocating(false);
        },
        (error) => {
          setLocationError('Unable to fetch location. You can enter it manually.');
          setIsLocating(false);
          console.error(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser.');
      setIsLocating(false);
    }
  }, []);


  const handleFetchCoordinates = async () => {
    if (!formData.address) {
      setLocationError("Please enter an address first.");
      return;
    }
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: formData.address,
          format: 'json',
          limit: 1
        }
      });
      if (response.data && response.data.length > 0) {

        const { lat, lon } = response.data[0];

        setFormData((prev) => ({
          ...prev,
          location: {
            latitude: parseFloat(lat).toFixed(5),
            longitude: parseFloat(lon).toFixed(5)
          }
        }))

      } else {
        setLocationError("No results found.");
      }
    } catch (error) {
      setLocationError("Error fetching coordinates.");
      console.error(error);
    }
  };

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'latitude' || name === 'longitude') {
      setFormData({
        ...formData,
        location: { ...formData.location, [name]: value },
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmissionStatus({ message: 'Submitting...', type: 'info' });

    if (!user.uuid || !user.privatekey) {
      setSubmissionStatus({ message: 'User not logged in or cookies missing.', type: 'error' });
      return;
    }

    const payload = {
      uuid: user.uuid,
      key: user.privatekey,
      data: {
        location: {
          latitude: parseFloat(formData.location.latitude),
          longitude: parseFloat(formData.location.longitude),
        },
        area: parseInt(formData.area, 10),
        shape: formData.shape,
        type: formData.type,
        speciesData: formData.speciesData.split(',').map((s) => s.trim()),
      },
    };

    try {
      const response = await axios.post('http://localhost:3000/api/submit', payload);
      console.log('Submission successful:', response.data);
      setSubmissionStatus({ message: `Submission successful! ID: ${response.data.submissionId}`, type: 'success' });
    } catch (error) {
      console.error('Submission error:', error);
      const errorMessage = error.response?.data?.error || 'An unknown error occurred.';
      setSubmissionStatus({ message: `Submission failed: ${errorMessage}`, type: 'error' });
    }
  };

  return (
    <div className='main-container'>
      <div className="form-container">
        <h2>Submit Project Data</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Address:
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Enter full address"
            />
            <button type="button" onClick={handleFetchCoordinates}>Get Coordinates</button>
          </label>
          <label>
            Latitude: <span className="location-status">{isLocating ? 'Fetching...' : ''}</span>
            <input
              type="text"
              name="latitude"
              value={formData.location.latitude}
              onChange={handleChange}
              placeholder="e.g., 21.9497"
              required
            />
          </label>

          <label>
            Longitude:
            <input
              type="text"
              name="longitude"
              value={formData.location.longitude}
              onChange={handleChange}
              placeholder="e.g., 89.1833"
              required
            />
          </label>
          {locationError && <p className="location-error">{locationError}</p>}

          <label>
            Area (in square meters):
            <input
              type="number"
              name="area"
              value={formData.area}
              onChange={handleChange}
              placeholder="e.g., 1000"
              required
            />
          </label>

          <label>
            Shape:
            <select name="shape" value={formData.shape} onChange={handleChange}>
              <option value="rectangle">Rectangle</option>
              <option value="polygon">Polygon</option>
              <option value="circle">Circle</option>
            </select>
          </label>

          <label>
            Project Type:
            <select name="type" value={formData.type} onChange={handleChange}>
              <option value="restoration">Restoration</option>
              <option value="conservation">Conservation</option>
              <option value="new_planting">New Planting</option>
            </select>
          </label>

          <label>
            Species (comma-separated):
            <input
              type="text"
              name="speciesData"
              value={formData.speciesData}
              onChange={handleChange}
              placeholder="e.g., Mangrove, Seagrass"
              required
            />
          </label>

          <button type="submit" disabled={isLocating}>
            {isLocating ? 'Please wait...' : 'Submit'}
          </button>

          {submissionStatus.message && (
            <p className={`submission-status ${submissionStatus.type}`}>{submissionStatus.message}</p>
          )}
        </form>
      </div>
    </div>
  );
}

export default UploadForm;
