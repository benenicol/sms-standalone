const express = require('express');
const router = express.Router();
const { storeCustomerMessage, getCustomerIdFromPhone } = require('../services/firestore');

// Twilio SMS webhook endpoint
router.post('/sms', async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`🔥 SMS Webhook received at ${timestamp}`);
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
    
    // Extract Twilio webhook parameters
    const { From, To, Body, MessageSid } = req.body;
    
    console.log(`📱 SMS from ${From} to ${To}: ${Body}`);
    
    // Validate required parameters
    if (!From || !To || !Body || !MessageSid) {
      console.log('❌ Missing required SMS parameters');
      return res.status(400)
        .set('Content-Type', 'text/xml')
        .send('<Response></Response>');
    }
    
    // Get customer ID and store message
    const customerId = await getCustomerIdFromPhone(From);
    console.log(`👤 Customer ID: ${customerId}`);
    
    const success = await storeCustomerMessage({
      customerId: customerId,
      channel: 'sms',
      direction: 'inbound',
      content: Body,
      channelData: {
        from: From,
        to: To,
        twilioSid: MessageSid
      },
      timestamp: new Date()
    });
    
    if (success) {
      console.log(`✅ Stored SMS message for customer ${customerId}`);
    } else {
      console.log(`⚠️ Failed to store SMS message for customer ${customerId}`);
    }
    
    // Return empty TwiML to prevent auto-reply
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
    
  } catch (error) {
    console.error(`❌ Error processing SMS webhook:`, error);
    
    // Still return empty TwiML even on error to prevent auto-reply
    res.status(500)
      .set('Content-Type', 'text/xml')
      .send('<Response></Response>');
  }
});

// Health check for webhook
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'webhook',
    timestamp: new Date().toISOString() 
  });
});

module.exports = router;