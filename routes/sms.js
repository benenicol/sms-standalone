const express = require('express');
const router = express.Router();
const { getCustomerConversations, sendReplyToCustomer, markConversationAsRead, fixCustomerProfile } = require('../services/firestore');
const { sendTestSMS, sendBulkSMS } = require('../services/twilio');
const { fetchOrdersForSMS } = require('../services/shopify');

// Get customer conversations for inbox
router.get('/conversations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const conversations = await getCustomerConversations(limit);
    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send reply to customer
router.post('/reply', async (req, res) => {
  try {
    const { customerId, message } = req.body;
    
    if (!customerId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer ID and message are required' 
      });
    }
    
    const result = await sendReplyToCustomer(customerId, message);
    res.json(result);
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark conversation as read
router.post('/mark-read/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer ID is required' 
      });
    }
    
    const result = await markConversationAsRead(customerId);
    res.json(result);
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send test SMS
router.post('/test', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone and message are required' 
      });
    }
    
    const result = await sendTestSMS(phone, message);
    res.json(result);
  } catch (error) {
    console.error('Error sending test SMS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get orders for SMS sending
router.get('/orders', async (req, res) => {
  try {
    const { 
      status = 'fulfilled', 
      limit = 50, 
      days = 7,
      tag 
    } = req.query;
    
    const orders = await fetchOrdersForSMS({
      status,
      limit: parseInt(limit),
      days: parseInt(days),
      tag
    });
    
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send bulk SMS
router.post('/bulk', async (req, res) => {
  try {
    const { orders, message, testMode = false } = req.body;
    
    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Orders array is required' 
      });
    }
    
    // Support both old format (single message) and new format (individual messages per order)
    if (!message && !orders.some(order => order.message)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either a global message or individual order messages are required' 
      });
    }
    
    const result = await sendBulkSMS(orders, message || '', testMode);
    res.json(result);
  } catch (error) {
    console.error('Error sending bulk SMS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fix customer profile with incorrect phone number
router.post('/fix-customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { correctPhone } = req.body;
    
    if (!customerId || !correctPhone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer ID and correct phone number are required' 
      });
    }
    
    const result = await fixCustomerProfile(customerId, correctPhone);
    res.json({ success: result });
  } catch (error) {
    console.error('Error fixing customer profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;