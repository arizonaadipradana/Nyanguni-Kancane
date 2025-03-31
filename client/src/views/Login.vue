<!-- client/src/views/Login.vue -->
<template>
    <div class="container">
      <div class="auth-form">
        <h2>Login</h2>
        
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
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
      </div>
    </div>
  </template>
  
  <script>
  import { mapGetters, mapActions } from 'vuex'
  
  export default {
    name: 'Login',
    
    data() {
      return {
        username: '',
        password: '',
        isLoading: false
      }
    },
    
    computed: {
      ...mapGetters(['errorMessage'])
    },
    
    methods: {
      ...mapActions(['login', 'clearErrorMessage']),
      
      async handleLogin() {
        this.isLoading = true
        
        try {
          const result = await this.login({
            username: this.username,
            password: this.password
          })
          
          if (result.success) {
            this.$router.push('/lobby')
          }
        } catch (error) {
          console.error('Login error:', error)
        } finally {
          this.isLoading = false
        }
      }
    },
    
    beforeUnmount() {
      this.clearErrorMessage()
    }
  }
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
  </style>