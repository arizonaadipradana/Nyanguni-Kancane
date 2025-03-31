<!-- client/src/views/Login.vue -->
<template>
  <div class="container">
    <div class="auth-form">
      <h2>Login</h2>
      
      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
        <button @click="clearErrorMessage" class="close-error">×</button>
      </div>
      
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">Username</label>
          <input 
            type="text" 
            id="username" 
            v-model="username" 
            required 
            class="form-control"
          />
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            required 
            class="form-control"
          />
        </div>
        
        <button type="submit" class="btn" :disabled="isLoading">
          {{ isLoading ? 'Logging in...' : 'Login' }}
        </button>
      </form>
      
      <p class="register-link">
        Don't have an account? 
        <router-link to="/register">Register</router-link>
      </p>
      
      <!-- Show API diagnostics if there's an error -->
      <div v-if="showDiagnostics">
        <hr>
        <ApiDiagnostic ref="diagnostics" />
      </div>
      
      <div class="debug-section">
        <button @click="toggleDiagnostics" class="debug-button">
          {{ showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapActions, mapMutations } from 'vuex';
import ApiDiagnostic from '@/components/ApiDiagnostic.vue';
import axios from 'axios';

export default {
  name: 'Login',
  
  components: {
    ApiDiagnostic
  },
  
  data() {
    return {
      username: '',
      password: '',
      isLoading: false,
      showDiagnostics: false,
      loginAttempts: 0
    };
  },
  
  computed: {
    ...mapGetters(['errorMessage'])
  },
  
  methods: {
    ...mapActions(['login', 'clearErrorMessage']),
    ...mapMutations(['SET_ERROR_MESSAGE']),
    
    toggleDiagnostics() {
      this.showDiagnostics = !this.showDiagnostics;
      if (this.showDiagnostics && this.$refs.diagnostics) {
        this.$refs.diagnostics.testConnection();
      }
    },
    
    async handleLogin() {
      this.isLoading = true;
      this.clearErrorMessage();
      
      try {
        // Log request info for debugging
        console.log('Login request to:', axios.defaults.baseURL);
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Login request timed out')), 10000);
        });
        
        // Race against timeout
        const result = await Promise.race([
          this.login({
            username: this.username,
            password: this.password
          }),
          timeoutPromise
        ]);
        
        if (result.success) {
          this.$router.push('/lobby');
        } else {
          // Auto-show diagnostics after multiple failed attempts
          this.loginAttempts++;
          if (this.loginAttempts >= 2) {
            this.showDiagnostics = true;
            if (this.$refs.diagnostics) {
              this.$refs.diagnostics.testConnection();
            }
          }
        }
      } catch (error) {
        console.error('Login error:', error);
        
        // Provide more helpful error messages for common issues
        if (error.message === 'Login request timed out') {
          this.SET_ERROR_MESSAGE('Login request timed out. Please check your connection and try again.');
        } else if (error.response?.status === 0 || error.message.includes('Network Error')) {
          this.SET_ERROR_MESSAGE('Network error. Please ensure you have internet access and the server is running.');
        } else {
          this.SET_ERROR_MESSAGE(error.message || 'Login failed. Please try again.');
        }
        
        // Auto-show diagnostics for network errors
        this.showDiagnostics = true;
        if (this.$refs.diagnostics) {
          this.$nextTick(() => {
            this.$refs.diagnostics.testConnection();
          });
        }
      } finally {
        this.isLoading = false;
      }
    }
  },
  
  beforeUnmount() {
    this.clearErrorMessage();
  }
};
</script>

<style scoped>
.auth-form {
  max-width: 400px;
  margin: 40px auto;
  padding: 30px;
  background-color: #2a2a2a;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

h2 {
  text-align: center;
  margin-top: 0;
  margin-bottom: 20px;
  color: #3f8c6e;
}

.error-message {
  background-color: #e74c3c;
  color: white;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
  position: relative;
}

.close-error {
  position: absolute;
  right: 10px;
  top: 10px;
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
}

button {
  width: 100%;
  margin-top: 10px;
}

.register-link {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
}

.register-link a {
  color: #3f8c6e;
  text-decoration: none;
}

.register-link a:hover {
  text-decoration: underline;
}

.debug-section {
  margin-top: 20px;
  text-align: center;
}

.debug-button {
  background-color: #555;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  width: auto;
}

.debug-button:hover {
  background-color: #444;
}

hr {
  border: none;
  border-top: 1px solid #444;
  margin: 20px 0;
}
</style>