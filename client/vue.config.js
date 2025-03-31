// vue.config.js
module.exports = {
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'https://eb37-2001-448a-4026-1e83-ad3a-493f-bbfd-d5fb.ngrok-free.app', // Replace with your ngrok URL
        ws: true,
        changeOrigin: true
      }
    }
  },
  lintOnSave: false
}