const express = require('express');
const cors = require('cors');
const requestRoutes = require('./routes/requestRoutes');
const staffRoutes = require('./routes/staffRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const userRoutes = require('./routes/userRoutes');
 
const app = express();
 
app.use(cors());
app.use(express.json());
 
// Auth
app.use('/api/v1/auth', authRoutes);
 
// Citizen routes
app.use('/api/v1/requester', requestRoutes);
app.use('/api/v1/requests', requestRoutes);
 
// Municipal / Staff routes
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/admin', staffRoutes);

app.use('/api/v1/users', userRoutes);
app.use('/api/users', userRoutes);
app.use('/users', userRoutes);
 
app.use(errorHandler);
 
module.exports = app;
 