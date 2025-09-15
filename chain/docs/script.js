// Tab switching for curl snippets
function showCurl(platform, endpointId) {
  const card = document.getElementById(endpointId);
  if (!card) return;
  // Hide all curl content and deactivate tabs
  card.querySelectorAll('.curl-content').forEach(el => el.classList.remove('active'));
  card.querySelectorAll('.curl-tab').forEach(el => el.classList.remove('active'));
  // Show selected content and activate tab
  card.querySelector('.curl-' + platform).classList.add('active');
  card.querySelector('.tab-' + platform).classList.add('active');
}

// Copy to clipboard for curl snippet
function copyCurl(preId) {
  const el = document.getElementById(preId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent)
    .then(() => {
      const btn = el.parentElement.querySelector('.copy-btn');
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1200);
    });
}

// Smooth scroll for anchor links
document.querySelectorAll('nav ul li a').forEach(link => {
  link.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
});