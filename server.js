// Load environment variables
require('dotenv').config();

// Log startup info
console.log('🚀 Starting SMS Webhook Server...');
console.log('📊 Node Version:', process.version);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('📡 Port:', process.env.PORT || 3000);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Add startup validation
console.log('🔧 Validating environment variables...');
const requiredEnvVars = [
  'FIRESTORE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT', 
  'SHOPIFY_SHOP',
  'SHOPIFY_ACCESS_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}
console.log('✅ All required environment variables present');

// Middleware - Environment-aware Helmet configuration
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';

if (isVercel) {
  // Relaxed CSP for Vercel to allow existing onclick handlers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }));
} else {
  // Standard Helmet for local development
  app.use(helmet());
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files - Vercel-compatible configuration
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Import routes with error handling
let webhookRoutes, smsRoutes;
try {
  console.log('📦 Loading webhook routes...');
  webhookRoutes = require('./routes/webhook');
  console.log('✅ Webhook routes loaded');
  
  console.log('📦 Loading SMS routes...');
  smsRoutes = require('./routes/sms');
  console.log('✅ SMS routes loaded');
} catch (error) {
  console.error('❌ Error loading routes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

// Routes
app.use('/webhook', webhookRoutes);
app.use('/api/sms', smsRoutes);

// Serve main interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check with environment validation
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    port: PORT,
    env_check: {
      firebase: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      shopify: !!process.env.SHOPIFY_SHOP,
      twilio: !!process.env.TWILIO_ACCOUNT_SID
    }
  };
  
  console.log('🔍 Health check requested:', health);
  res.json(health);
});

// Deployment status endpoint
app.get('/deployment-status', (req, res) => {
  res.json({
    status: 'deployed',
    timestamp: new Date().toISOString(),
    message: 'SMS Webhook server is running successfully',
    endpoints: {
      webhook: '/webhook/sms',
      conversations: '/api/sms/conversations',
      health: '/health'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 SMS Webhook server running on port ${PORT}`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
});

module.exports = app;