const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Disable caching for HTML so users always get the latest version
app.use((req, res, next) => {
  if (req.url.endsWith('.html') || req.url === '/' || !req.url.includes('.')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  }
  next();
});

app.use(express.static(path.join(__dirname), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`JJ&A Time Tracker running on port ${PORT}`);
});

module.exports = app;
