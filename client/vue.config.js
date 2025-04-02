module.exports = {
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Updated from 3000 to 5000
        ws: true,
        changeOrigin: true,
        timeout: 10000, // 10 second timeout
        onError: (err, req, res) => {
          console.error('Proxy error:', err);
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            error: 'Proxy error',
            message: 'Could not connect to API server',
            details: err.message
          }));
        }
      },
      '/socket.io': {
        target: 'http://localhost:5000', // Updated from 3000 to 5000
        ws: true,
        changeOrigin: true
      }
    },
    // Add headers to allow cross-origin requests from other devices on your network
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization, x-auth-token'
    }
  },
  lintOnSave: false
}