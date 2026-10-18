'use strict';

const express = require('express');
const requestRoutes = require('./routes/requestRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});


app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/auth', authRoutes);


app.use(errorHandler);


app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

module.exports = app;