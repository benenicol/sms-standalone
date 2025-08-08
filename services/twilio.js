const twilio = require('twilio');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * Format phone number for display
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const areaCode = cleaned.slice(1, 4);
    const exchange = cleaned.slice(4, 7);
    const number = cleaned.slice(7);
    return `+1 (${areaCode}) ${exchange}-${number}`;
  } else if (cleaned.length === 10) {
    const areaCode = cleaned.slice(0, 3);
    const exchange = cleaned.slice(3, 6);
    const number = cleaned.slice(6);
    return `+1 (${areaCode}) ${exchange}-${number}`;
  }
  
  return phone;
}

/**
 * Send a single SMS message
 */
async function sendSingleSMS(phone, message, customerName = 'Customer', type = 'NOTIFICATION') {
  try {
    console.log(`📤 Sending ${type} SMS to ${customerName} (${phone})`);
    console.log(`📝 Message: ${message}`);
    
    const messageResponse = await client.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: phone
    });
    
    console.log(`✅ SMS sent to ${phone}, SID: ${messageResponse.sid}`);
    return true;
    
  } catch (error) {
    console.error(`✗ SMS error to ${phone}: ${error.message}`);
    return false;
  }
}

/**
 * Send a test SMS message
 */
async function sendTestSMS(testPhone, message) {
  try {
    const success = await sendSingleSMS(testPhone, message, 'Test User', 'TEST');
    
    // Store the test message in Firestore if successful
    if (success) {
      try {
        const { getCustomerIdFromPhone, storeCustomerMessage } = require('./firestore');
        const customerId = await getCustomerIdFromPhone(testPhone);
        await storeCustomerMessage({
          customerId: customerId,
          channel: 'sms',
          direction: 'outbound',
          content: message,
          channelData: {
            from: process.env.TWILIO_PHONE_NUMBER,
            to: testPhone,
            type: 'test'
          },
          timestamp: new Date()
        });
        console.log(`💾 Stored test message for customer ${customerId}`);
      } catch (firestoreError) {
        console.error(`⚠️ Failed to store test message: ${firestoreError.message}`);
      }
    }
    
    return {
      success,
      phone: testPhone,
      message: message,
      timestamp: new Date().toISOString(),
      ...(success ? {} : { error: 'Failed to send SMS' })
    };
    
  } catch (error) {
    console.error(`Error in sendTestSMS: ${error.message}`);
    return {
      success: false,
      phone: testPhone,
      message: message,
      error: error.message
    };
  }
}

/**
 * Send bulk SMS messages to multiple customers
 */
async function sendBulkSMS(orders, messageTemplate, testMode = false) {
  const { getCustomerIdFromPhone, storeCustomerMessage } = require('./firestore');
  
  const results = {
    success: [],
    errors: [],
    totalSent: 0,
    totalErrors: 0
  };
  
  console.log(`📤 Starting bulk SMS send - ${orders.length} orders (Test mode: ${testMode})`);
  
  for (const order of orders) {
    try {
      const phone = order.customer.phone;
      const customerName = order.customer.name;
      
      if (!phone) {
        results.errors.push({
          orderNumber: order.orderNumber,
          customerName: customerName,
          error: 'No phone number'
        });
        continue;
      }
      
      // Use individual message if provided, otherwise use template
      let personalizedMessage;
      if (order.message) {
        personalizedMessage = order.message;
      } else {
        personalizedMessage = messageTemplate
          .replace(/\{customerName\}/g, customerName)
          .replace(/\{orderNumber\}/g, order.orderNumber)
          .replace(/\{deliveryMethod\}/g, order.deliveryMethod)
          .replace(/\{totalPrice\}/g, `$${order.totalPrice}`);
      }
      
      if (testMode) {
        console.log(`🧪 TEST MODE - Would send to ${customerName} (${phone}): ${personalizedMessage}`);
        results.success.push({
          phone: phone,
          customerName: customerName,
          orderNumber: order.orderNumber,
          message: personalizedMessage,
          testMode: true
        });
      } else {
        const success = await sendSingleSMS(phone, personalizedMessage, customerName, 'BULK');
        
        if (success) {
          // Store the sent message in Firestore
          try {
            const customerId = await getCustomerIdFromPhone(phone);
            await storeCustomerMessage({
              customerId: customerId,
              channel: 'sms',
              direction: 'outbound',
              content: personalizedMessage,
              channelData: {
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phone,
                type: 'bulk'
              },
              timestamp: new Date()
            });
            console.log(`💾 Stored bulk message for customer ${customerId}`);
          } catch (firestoreError) {
            console.error(`⚠️ Failed to store bulk message: ${firestoreError.message}`);
          }
          
          results.success.push({
            phone: phone,
            customerName: customerName,
            orderNumber: order.orderNumber,
            message: personalizedMessage
          });
        } else {
          results.errors.push({
            phone: phone,
            customerName: customerName,
            orderNumber: order.orderNumber,
            error: 'Failed to send SMS'
          });
        }
        
        // Rate limiting - wait 200ms between messages
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
    } catch (error) {
      console.error(`ERROR sending SMS to ${order.customer.name}: ${error.message}`);
      results.errors.push({
        phone: order.customer.phone,
        customerName: order.customer.name,
        orderNumber: order.orderNumber,
        error: error.message
      });
    }
  }
  
  results.totalSent = results.success.length;
  results.totalErrors = results.errors.length;
  
  console.log(`📊 Bulk SMS complete: ${results.totalSent} sent, ${results.totalErrors} errors`);
  
  return results;
}

/**
 * Validate Twilio configuration
 */
async function validateTwilioConfig() {
  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error('Missing Twilio configuration');
    }
    
    // Test by fetching account info
    const account = await client.api.accounts(TWILIO_ACCOUNT_SID).fetch();
    console.log(`✅ Twilio connection verified for account: ${account.friendlyName}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Twilio configuration error: ${error.message}`);
    return false;
  }
}

module.exports = {
  formatPhoneNumber,
  sendSingleSMS,
  sendTestSMS,
  sendBulkSMS,
  validateTwilioConfig
};