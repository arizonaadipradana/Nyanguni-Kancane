<!-- client/src/App.vue -->
<template>
  <div id="app">
    <router-view/>
  </div>
</template>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: 'Arial', sans-serif;
  background-color: #1e1e1e;
  color: #ffffff;
}

#app {
  width: 100%;
  min-height: 100vh;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.btn {
  display: inline-block;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background-color: #3f8c6e;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.btn:hover {
  background-color: #2c664e;
}

.btn:disabled {
  background-color: #555;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #555;
}

.btn-secondary:hover {
  background-color: #444;
}

.btn-danger {
  background-color: #e74c3c;
}

.btn-danger:hover {
  background-color: #c0392b;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
}

.form-control {
  width: 100%;
  padding: 8px;
  border: 1px solid #555;
  border-radius: 4px;
  background-color: #333;
  color: white;
}

.card {
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>