// client/src/router/index.js
import Vue from 'vue'
import VueRouter from 'vue-router'
import axios from 'axios'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Lobby from '../views/Lobby.vue'
import Game from '../views/Game.vue'

Vue.use(VueRouter)

const originalPush = VueRouter.prototype.push
VueRouter.prototype.push = function push(location) {
  return originalPush.call(this, location).catch(err => {
    // Only throw error if it's not a NavigationDuplicated error
    if (err.name !== 'NavigationDuplicated') {
      return Promise.reject(err)
    }
    // Otherwise swallow the error
    return Promise.resolve()
  })
}

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/register',
    name: 'Register',
    component: Register
  },
  {
    path: '/lobby',
    name: 'Lobby',
    component: Lobby,
    meta: { requiresAuth: true }
  },
  {
    path: '/game/:id',
    name: 'Game',
    component: Game,
    meta: { requiresAuth: true }
  }
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

// Navigation guard for authentication
router.beforeEach((to, from, next) => {
  // Check if the route requires authentication
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  
  // Get token from localStorage
  const token = localStorage.getItem('token');
  const isAuthenticated = !!token;
  
  console.log('Route navigation:', {
    from: from.path,
    to: to.path,
    requiresAuth,
    isAuthenticated
  });
  
  // Set up auth header if token exists
  if (token) {
    axios.defaults.headers.common['x-auth-token'] = token;
  } else {
    delete axios.defaults.headers.common['x-auth-token'];
  }
  
  // Handle circular redirects
  const isRedirectLoop = from.path === '/game/' + from.params.id && 
                         to.path === '/login' && 
                         isAuthenticated;
  
  if (isRedirectLoop) {
    console.log('Preventing redirect loop, staying on current page');
    return next(false);
  }
  
  if (requiresAuth && !isAuthenticated) {
    console.log('Authentication required, redirecting to login');
    next('/login');
  } else if (to.path === '/login' && isAuthenticated) {
    // Optional: redirect already logged in users away from login page
    console.log('Already authenticated, redirecting to lobby');
    next('/lobby');
  } else {
    next();
  }
});

router.beforeEach(async (to, from, next) => {
  // Check if the route requires authentication
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  
  // Get token from localStorage
  const token = localStorage.getItem('token');
  const isAuthenticated = !!token;
  
  console.log('Route navigation:', {
    to: to.path,
    requiresAuth,
    isAuthenticated
  });
  
  // Set up auth header if token exists
  if (token) {
    axios.defaults.headers.common['x-auth-token'] = token;
  } else {
    delete axios.defaults.headers.common['x-auth-token'];
  }
  
  if (requiresAuth && !isAuthenticated) {
    console.log('Authentication required, redirecting to login');
    next('/login');
  } else if (to.path === '/login' && isAuthenticated) {
    // Optional: redirect already logged in users away from login page
    console.log('Already authenticated, redirecting to lobby');
    next('/lobby');
  } else {
    next();
  }
});

export default router