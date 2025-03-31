// client/vue.config.js
module.exports = {
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Local server URL instead of ngrok
        ws: true,
        changeOrigin: true
      }
    }
  },
  lintOnSave: false
}