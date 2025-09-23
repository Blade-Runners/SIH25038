import React, { useState, useEffect } from 'react';
import './UploadForm.css';

function UploadForm() {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    address: '',
    image: null,
  });

  const [preview, setPreview] = useState(null);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState(null);

  //Get Live Location on Mount
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const coords = `${position.coords.latitude}, ${position.coords.longitude}`;
          setFormData((prev) => ({ ...prev, location: coords }));
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

      // Cleanup location
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setLocationError('Geolocation is not supported by your browser.');
      setIsLocating(false);
    }
  }, []);

  //Handle input changes
  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'image') {
      const file = files[0];
      setFormData({ ...formData, image: file });
      setPreview(URL.createObjectURL(file));
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Form submitted! (Prototype only)');
    console.log(formData); // Log all form data, including address

    // Reset form
    setFormData({ name: '', location: '', image: null });
    setPreview(null);
  };

  return (
    <div className="form-container">
      <h2>Upload Mangrove Planting Photo</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Your Name:
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Location: <span className="location-status">{isLocating ? 'Fetching location...' : ''}</span>
          <input
            type="text"
            name="location"
            value={formData.location}
            onChange={handleChange}
            required
          />
        </label>
        {locationError && (
          <p className="location-error">{locationError}</p>
        )}

        <label>
          Address:
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Upload Image:
          <input
            type="file"
            name="image"
            accept="image/*"
            onChange={handleChange}
            required
          />
        </label>

        {preview && (
          <img src={preview} alt="Preview" className="preview" />
        )}

        <button type="submit" disabled={isLocating}>
          {isLocating ? 'Please wait...' : 'Submit'}
        </button>
      </form>
    </div>
  );
}

export default UploadForm;
