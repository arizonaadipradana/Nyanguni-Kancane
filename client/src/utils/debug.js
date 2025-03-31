export const setupNetworkDebug = () => {
    if (process.env.NODE_ENV !== 'production') {
      // Set up Axios request interceptor
      const axios = require('axios');
      
      axios.interceptors.request.use(
        config => {
          console.group('API Request');
          console.log('URL:', config.url);
          console.log('Method:', config.method.toUpperCase());
          console.log('Headers:', config.headers);
          if (config.data) {
            console.log('Request Data:', config.data);
          }
          console.groupEnd();
          return config;
        },
        error => {
          console.error('Request Error:', error);
          return Promise.reject(error);
        }
      );
      
      axios.interceptors.response.use(
        response => {
          console.group('API Response');
          console.log('Status:', response.status);
          console.log('Data:', response.data);
          console.groupEnd();
          return response;
        },
        error => {
          console.group('API Error Response');
          if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
            console.log('Headers:', error.response.headers);
          } else if (error.request) {
            console.log('Request made but no response received');
            console.log(error.request);
          } else {
            console.log('Error setting up request:', error.message);
          }
          console.log('Error Config:', error.config);
          console.groupEnd();
          return Promise.reject(error);
        }
      );
      
      console.log('Network debugging enabled');
      
      // Optional: also monitor fetch API
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        console.group('Fetch Request');
        console.log('Arguments:', args);
        try {
          const response = await originalFetch(...args);
          console.log('Fetch Response:', response);
          console.groupEnd();
          return response;
        } catch (error) {
          console.log('Fetch Error:', error);
          console.groupEnd();
          throw error;
        }
      };
    }
  };
  