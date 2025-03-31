<!-- client/src/views/Register.vue -->
<template>
    <div class="container">
      <div class="auth-form">
        <h2>Register</h2>
        
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>
        
        <form @submit.prevent="handleRegister">
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
          
          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input 
              type="password" 
              id="confirmPassword" 
              v-model="confirmPassword" 
              required 
              class="form-control"
            />
            <div v-if="!passwordsMatch" class="validation-error">
              Passwords do not match
            </div>
          </div>
          
          <button 
            type="submit" 
            class="btn" 
            :disabled="isLoading || !passwordsMatch"
          >
            {{ isLoading ? 'Registering...' : 'Register' }}
          </button>
        </form>
        
        <p class="login-link">
          Already have an account? 
          <router-link to="/login">Login</router-link>
        </p>
      </div>
    </div>
  </template>
  
  <script>
  import { mapGetters, mapActions } from 'vuex'
  
  export default {
    name: 'Register',
    
    data() {
      return {
        username: '',
        password: '',
        confirmPassword: '',
        isLoading: false
      }
    },
    
    computed: {
      ...mapGetters(['errorMessage']),
      
      passwordsMatch() {
        return !this.confirmPassword || this.password === this.confirmPassword
      }
    },
    
    methods: {
      ...mapActions(['register', 'clearErrorMessage']),
      
      async handleRegister() {
        if (!this.passwordsMatch) {
          return
        }
        
        this.isLoading = true
        
        try {
          const result = await this.register({
            username: this.username,
            password: this.password
          })
          
          if (result.success) {
            this.$router.push('/lobby')
          }
        } catch (error) {
          console.error('Registration error:', error)
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
  
  .validation-error {
    color: #e74c3c;
    font-size: 12px;
    margin-top: 5px;
  }
  
  button {
    width: 100%;
    margin-top: 10px;
  }
  
  .login-link {
    text-align: center;
    margin-top: 20px;
    font-size: 14px;
  }
  
  .login-link a {
    color: #3f8c6e;
    text-decoration: none;
  }
  
  .login-link a:hover {
    text-decoration: underline;
  }
  </style>