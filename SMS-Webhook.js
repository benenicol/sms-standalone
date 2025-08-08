// SMS-Webhook.js
// Standalone SMS webhook handler for Twilio

/**
 * Main webhook handler - handles only SMS webhooks from Twilio
 */
function doPost(e) {
  // MINIMAL DEBUG VERSION - Log everything and return immediately
  const timestamp = new Date().toISOString();
  
  try {
    Logger.log(`🔥 MINIMAL doPost called at ${timestamp}`);
    logToSheet(`🔥 MINIMAL doPost called at ${timestamp}`);
    
    // Log absolutely everything about the request
    Logger.log('🔍 Request object keys: ' + Object.keys(e || {}));
    Logger.log('🔍 Full request: ' + JSON.stringify(e, null, 2));
    logToSheet('🔍 Request data: ' + JSON.stringify(e));
    
    // Log parameters specifically
    const params = e.parameter || {};
    const postData = e.postData || {};
    
    Logger.log('📋 Parameters: ' + JSON.stringify(params));
    Logger.log('📋 Post Data: ' + JSON.stringify(postData));
    logToSheet('📋 Params: ' + JSON.stringify(params));
    logToSheet('📋 PostData: ' + JSON.stringify(postData));
    
    Logger.log('✅ doPost executed successfully');
    logToSheet('✅ doPost completed successfully');
    
    // Return simple response
    return ContentService
      .createTextOutput('<Response><Message>Debug: Webhook received</Message></Response>')
      .setMimeType(ContentService.MimeType.XML);
      
  } catch (error) {
    const errorMsg = `🚨 doPost ERROR: ${error.message}`;
    Logger.log(errorMsg);
    Logger.log(`🚨 Error stack: ${error.stack}`);
    logToSheet(errorMsg);
    
    return ContentService
      .createTextOutput('<Response><Message>Debug: Error occurred</Message></Response>')
      .setMimeType(ContentService.MimeType.XML);
  }
}

// Add a simple test function to verify webhook is callable
function testDoPost() {
  const mockEvent = {
    parameter: {
      From: '+1234567890',
      To: '+0987654321',
      Body: 'Test message',
      MessageSid: 'SM123456'
    }
  };
  
  Logger.log('Testing doPost function...');
  const result = doPost(mockEvent);
  Logger.log('Test complete');
  return result;
}

// Ultra-simple test to verify POST requests work
function testWebhookConnection() {
  Logger.log('🔧 Webhook connection test started');
  logToSheet('🔧 Webhook connection test - function called successfully');
  
  return ContentService
    .createTextOutput('{"status":"ok","message":"Webhook is working"}')
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Serve the SMS management interface HTML page
 */
function doGet() {
  return HtmlService.createTemplateFromFile('SMS-Interface')
    .evaluate()
    .setTitle('SMS Notification Manager - Standalone')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Get Firestore access token for authentication
 */
function getAccessToken() {
  const keyJson = PropertiesService.getScriptProperties().getProperty(SERVICE_ACCOUNT_KEY_PROP);
  if (!keyJson) throw new Error('Missing service account key');
  const key = JSON.parse(keyJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg:'RS256', typ:'JWT' };
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const encode = obj => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/,'');
  const unsigned = encode(header) + '.' + encode(claim);
  const sig = Utilities.computeRsaSha256Signature(unsigned, key.private_key);
  const jwt = unsigned + '.' + Utilities.base64EncodeWebSafe(sig).replace(/=+$/,'');

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }
  });
  const tok = JSON.parse(res.getContentText());
  if (!tok.access_token) throw new Error('Auth failure: ' + res.getContentText());
  return tok.access_token;
}

/**
 * Get or create customer ID from phone number
 */
function getCustomerIdFromPhone(phoneNumber) {
  try {
    // Try to find customer in Shopify by phone number
    const shopifyCustomerId = getShopifyCustomerIdByPhone(phoneNumber);
    
    if (shopifyCustomerId) {
      Logger.log(`Found Shopify customer: ${shopifyCustomerId}`);
      return shopifyCustomerId;
    }
    
    // Create customer with phone as ID (fallback)
    const newCustomerId = `phone_${phoneNumber.replace(/\D/g, '')}`;
    Logger.log(`Created phone-based customer ID: ${newCustomerId}`);
    return newCustomerId;
    
  } catch (error) {
    Logger.log(`Error getting customer ID: ${error.message}`);
    // Fallback to phone-based ID
    return `phone_${phoneNumber.replace(/\D/g, '')}`;
  }
}

/**
 * Normalize phone number to E.164 format for consistent matching
 */
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  
  // Remove all non-digits
  const digits = phoneNumber.replace(/\D/g, '');
  
  // If it starts with 1 and is 11 digits, it's already in good format
  if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }
  
  // If it's 10 digits, add +1 for US/Canada
  if (digits.length === 10) {
    return '+1' + digits;
  }
  
  // For other formats, just add + if not present
  if (phoneNumber.startsWith('+')) {
    return phoneNumber.replace(/\D/g, '').replace(/^/, '+');
  }
  
  return '+' + digits;
}

/**
 * Search Shopify for customer by phone number
 */
function getShopifyCustomerIdByPhone(phoneNumber) {
  try {
    // Try multiple phone number formats
    const phoneFormats = [
      phoneNumber,
      normalizePhoneNumber(phoneNumber),
      phoneNumber.replace(/\D/g, ''), // digits only
      phoneNumber.replace('+1', ''), // remove +1 prefix
    ];
    
    for (const phone of phoneFormats) {
      if (!phone) continue;
      
      const url = `https://${SHOP}/admin/api/${API_VERSION}/customers.json?phone=${encodeURIComponent(phone)}`;
      
      const response = UrlFetchApp.fetch(url, {
        headers: { 'X-Shopify-Access-Token': TOKEN },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        const data = JSON.parse(response.getContentText());
        if (data.customers && data.customers.length > 0) {
          Logger.log(`Found Shopify customer with phone format: ${phone}`);
          return data.customers[0].id.toString();
        }
      }
    }
    
    return null;
    
  } catch (error) {
    Logger.log(`Error searching Shopify customers: ${error.message}`);
    return null;
  }
}

function getShopifyCustomerData(phoneNumber) {
  try {
    // Try multiple phone number formats
    const phoneFormats = [
      phoneNumber,
      normalizePhoneNumber(phoneNumber),
      phoneNumber.replace(/\D/g, ''), // digits only
      phoneNumber.replace('+1', ''), // remove +1 prefix
    ];
    
    for (const phone of phoneFormats) {
      if (!phone) continue;
      
      const url = `https://${SHOP}/admin/api/${API_VERSION}/customers.json?phone=${encodeURIComponent(phone)}`;
      
      const response = UrlFetchApp.fetch(url, {
        headers: { 'X-Shopify-Access-Token': TOKEN },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        const data = JSON.parse(response.getContentText());
        if (data.customers && data.customers.length > 0) {
          Logger.log(`Found Shopify customer data with phone format: ${phone}`);
          return data.customers[0];
        }
      }
    }
    
    return null;
    
  } catch (error) {
    Logger.log(`Error getting Shopify customer data: ${error.message}`);
    return null;
  }
}

/**
 * Store a customer message in Firestore
 */
function storeCustomerMessage(messageData) {
  try {
    const token = getAccessToken();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;
    
    // Create customer document if it doesn't exist
    const customerDocUrl = `${baseUrl}/${CUSTOMER_COMMUNICATIONS_COLLECTION}/${messageData.customerId}`;
    
    // Get existing customer document
    const existingResponse = UrlFetchApp.fetch(customerDocUrl, {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    
    let customerDoc;
    if (existingResponse.getResponseCode() === 200) {
      // Customer exists, get current data
      const existingData = JSON.parse(existingResponse.getContentText());
      customerDoc = convertFromFirestoreFields(existingData.fields || {});
      
      // If customer doesn't have Shopify data, try to enrich it
      if (!customerDoc.profile.shopifyId) {
        const shopifyCustomer = getShopifyCustomerData(messageData.channelData.from);
        if (shopifyCustomer) {
          const fullName = `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim();
          customerDoc.profile.name = fullName || customerDoc.profile.name;
          customerDoc.profile.email = shopifyCustomer.email || customerDoc.profile.email;
          customerDoc.profile.shopifyId = shopifyCustomer.id.toString();
          customerDoc.profile.updatedAt = new Date().toISOString();
          Logger.log(`Enriched existing customer with Shopify data: ${fullName} (ID: ${shopifyCustomer.id})`);
        }
      }
    } else {
      // Create new customer - try to get Shopify data first
      const shopifyCustomer = getShopifyCustomerData(messageData.channelData.from);
      
      if (shopifyCustomer) {
        // Use Shopify customer data
        const fullName = `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim();
        customerDoc = {
          profile: {
            name: fullName || `Customer ${messageData.channelData.from.slice(-4)}`,
            phone: messageData.channelData.from,
            email: shopifyCustomer.email || null,
            shopifyId: shopifyCustomer.id.toString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          conversations: []
        };
        Logger.log(`Created new customer with Shopify data: ${fullName} (ID: ${shopifyCustomer.id})`);
      } else {
        // Fallback to basic customer
        customerDoc = {
          profile: {
            name: `Customer ${messageData.channelData.from.slice(-4)}`,
            phone: messageData.channelData.from,
            email: null,
            shopifyId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          conversations: []
        };
        Logger.log(`Created new customer without Shopify data: ${messageData.channelData.from}`);
      }
    }
    
    // Add new message to conversations
    const newMessage = {
      id: Utilities.getUuid(),
      timestamp: messageData.timestamp.toISOString(),
      channel: messageData.channel,
      direction: messageData.direction,
      content: messageData.content,
      channelData: messageData.channelData,
      status: 'received'
    };
    
    customerDoc.conversations = customerDoc.conversations || [];
    customerDoc.conversations.push(newMessage);
    customerDoc.profile.updatedAt = new Date().toISOString();
    
    // Convert to Firestore format and save
    const firestoreFields = convertToFirestoreFields(customerDoc);
    
    const saveResponse = UrlFetchApp.fetch(customerDocUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ fields: firestoreFields })
    });
    
    return saveResponse.getResponseCode() === 200;
    
  } catch (error) {
    Logger.log(`Error storing message: ${error.message}`);
    return false;
  }
}

/**
 * Convert JavaScript object to Firestore fields format
 */
function convertToFirestoreFields(obj) {
  const fields = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value == null) return;
    
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: value.toString() };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(item => {
            if (typeof item === 'string') return { stringValue: item };
            if (typeof item === 'number') return { doubleValue: item };
            if (typeof item === 'object') return { mapValue: { fields: convertToFirestoreFields(item) } };
            return { stringValue: item.toString() };
          })
        }
      };
    } else if (typeof value === 'object') {
      fields[key] = { mapValue: { fields: convertToFirestoreFields(value) } };
    }
  });
  
  return fields;
}

/**
 * Convert Firestore fields format back to JavaScript object
 */
function convertFromFirestoreFields(fields) {
  const obj = {};
  
  if (!fields) {
    return obj;
  }
  
  Object.entries(fields).forEach(([key, fieldValue]) => {
    if (fieldValue.stringValue !== undefined) {
      obj[key] = fieldValue.stringValue;
    } else if (fieldValue.integerValue !== undefined) {
      obj[key] = parseInt(fieldValue.integerValue);
    } else if (fieldValue.doubleValue !== undefined) {
      obj[key] = fieldValue.doubleValue;
    } else if (fieldValue.booleanValue !== undefined) {
      obj[key] = fieldValue.booleanValue;
    } else if (fieldValue.timestampValue !== undefined) {
      obj[key] = new Date(fieldValue.timestampValue);
    } else if (fieldValue.arrayValue !== undefined) {
      obj[key] = fieldValue.arrayValue.values.map(item => {
        if (item.stringValue !== undefined) return item.stringValue;
        if (item.integerValue !== undefined) return parseInt(item.integerValue);
        if (item.doubleValue !== undefined) return item.doubleValue;
        if (item.booleanValue !== undefined) return item.booleanValue;
        if (item.mapValue !== undefined) return convertFromFirestoreFields(item.mapValue.fields);
        return item.toString();
      });
    } else if (fieldValue.mapValue !== undefined) {
      obj[key] = convertFromFirestoreFields(fieldValue.mapValue.fields);
    }
  });
  
  return obj;
}

/**
 * Log to Google Sheets for debugging
 */
function logToSheet(message) {
  try {
    const now = Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd HH:mm:ss');
    const ss = getSS();
    let sheet = ss.getSheetByName('SMS Webhook Logs');
    if (!sheet) {
      sheet = ss.insertSheet('SMS Webhook Logs');
      sheet.appendRow(['Timestamp', 'Message']);
    }
    sheet.appendRow([now, message]);
  } catch (error) {
    Logger.log(`Error logging to sheet: ${error.message}`);
  }
}

/**
 * Test function to verify webhook setup
 */
function testWebhookSetup() {
  Logger.log('Testing webhook setup...');
  
  // Test Firestore connection
  try {
    const token = getAccessToken();
    Logger.log('✅ Firestore authentication successful');
  } catch (error) {
    Logger.log('❌ Firestore authentication failed: ' + error.message);
    return false;
  }
  
  // Test Shopify connection
  try {
    const url = `https://${SHOP}/admin/api/${API_VERSION}/customers.json?limit=1`;
    const response = UrlFetchApp.fetch(url, {
      headers: { 'X-Shopify-Access-Token': TOKEN }
    });
    
    if (response.getResponseCode() === 200) {
      Logger.log('✅ Shopify API connection successful');
    } else {
      Logger.log('❌ Shopify API connection failed: ' + response.getResponseCode());
    }
  } catch (error) {
    Logger.log('❌ Shopify API test failed: ' + error.message);
  }
  
  Logger.log('Webhook setup test completed');
  return true;
}

// ================================================================================
// SMS MANAGEMENT FUNCTIONS
// ================================================================================

/**
 * Get unfulfilled orders from Shopify with subscription item processing
 */
function getUnfulfilledOrders() {
  Logger.log('Fetching unfulfilled orders from Shopify...');
  
  try {
    const url = `https://${SHOP}/admin/api/${API_VERSION}/orders.json?status=open&fulfillment_status=unfulfilled&limit=250`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.getResponseCode() !== 200) {
      throw new Error(`Shopify API error: ${response.getResponseCode()} - ${response.getContentText()}`);
    }
    
    const data = JSON.parse(response.getContentText());
    const orders = data.orders || [];
    
    Logger.log(`Successfully fetched ${orders.length} unfulfilled orders`);
    
    // Process orders to include subscription items
    const processedOrders = orders.map(order => {
      const subscriptionItems = getOrderSubscriptionItems(order);
      
      return {
        id: order.id,
        name: order.name,
        order_number: order.order_number,
        tags: order.tags,
        customer: order.customer,
        billing_address: order.billing_address,
        shipping_address: order.shipping_address,
        shipping_lines: order.shipping_lines,
        line_items: order.line_items,
        created_at: order.created_at,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        subscriptionItems: subscriptionItems
      };
    });
    
    return processedOrders;
    
  } catch (error) {
    Logger.log(`ERROR fetching orders: ${error.message}`);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
}

/**
 * Process order to extract subscription items
 */
function getOrderSubscriptionItems(order) {
  const trimPattern = /\s*\(\s*grass\s*[-]?\s*fed\s*&\s*finished[^)]*\)/i;
  
  // Get box type from metafield
  let boxType = '';
  try {
    const metafields = getOrderMetafields(order.id.toString());
    const boxMetafield = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'box_config');
    boxType = boxMetafield?.value || '';
  } catch (e) {
    Logger.log(`⚠ getOrderMetafields(${order.id}) threw: ${e}`);
  }
  
  // Classify line items into subscription items
  const subsArr = [];
  (order.line_items || []).forEach(li => {
    const cleanTitle = li.title.replace(trimPattern, '').trim();
    const qty = li.quantity;
    const subKey = ['Quarter of a Quarter', 'Carnivore Diet Box', 'Meal Maker'].find(name => cleanTitle.startsWith(name));
    
    if (subKey) {
      let itemStr = `${subKey} ×${qty}`;
      if (/Quarter of a Quarter/i.test(subKey) && boxType) {
        itemStr += ` (${boxType})`;
      }
      subsArr.push(itemStr);
    }
  });
  
  return subsArr.join('; ');
}

/**
 * Get order metafields
 */
function getOrderMetafields(orderId) {
  const url = `https://${SHOP}/admin/api/${API_VERSION}/orders/${orderId}/metafields.json`;
  const res = UrlFetchApp.fetch(url, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`getOrderMetafields(${orderId}) failed: HTTP ${res.getResponseCode()}`);
  }
  return JSON.parse(res.getContentText()).metafields || [];
}

/**
 * Send bulk SMS messages via Twilio
 */
function sendBulkSMSMessages(smsData) {
  Logger.log(`Sending ${smsData.length} SMS messages via Twilio...`);
  
  const results = {
    successCount: 0,
    errors: []
  };
  
  smsData.forEach((sms, index) => {
    try {
      Logger.log(`Sending SMS ${index + 1}/${smsData.length} to ${sms.phone} for order ${sms.orderNumber}`);
      
      const success = sendSingleSMS(sms.phone, sms.message, sms.customerName, sms.orderNumber);
      
      if (success) {
        results.successCount++;
      } else {
        results.errors.push({
          phone: sms.phone,
          orderNumber: sms.orderNumber,
          error: 'Failed to send SMS'
        });
      }
      
      // Small delay to avoid rate limiting
      Utilities.sleep(200);
      
    } catch (error) {
      Logger.log(`ERROR sending SMS to ${sms.phone}: ${error.message}`);
      results.errors.push({
        phone: sms.phone,
        orderNumber: sms.orderNumber,
        error: error.message
      });
    }
  });
  
  Logger.log(`SMS sending complete: ${results.successCount} successful, ${results.errors.length} failed`);
  return results;
}

/**
 * Send a single SMS message via Twilio
 */
function sendSingleSMS(phone, message, customerName, orderNumber) {
  try {
    Logger.log(`Sending SMS via Twilio to ${phone} (${customerName}, Order ${orderNumber})`);
    
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const payload = `From=${encodeURIComponent(TWILIO_PHONE_NUMBER)}&To=${encodeURIComponent(phone)}&Body=${encodeURIComponent(message)}`;
    
    // Create Basic Auth header
    const credentials = Utilities.base64Encode(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      payload: payload,
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`Twilio SMS Response: ${responseCode} - ${responseText}`);
    
    if (responseCode === 200 || responseCode === 201) {
      Logger.log(`✓ SMS sent successfully via Twilio to ${phone} (${customerName}, Order ${orderNumber})`);
      return true;
    } else {
      Logger.log(`✗ Twilio SMS failed to ${phone}: ${responseCode} - ${responseText}`);
      return false;
    }
    
  } catch (error) {
    Logger.log(`✗ SMS error to ${phone}: ${error.message}`);
    return false;
  }
}

/**
 * Send a test SMS message
 */
function sendTestSMS(message) {
  const testPhone = '+61459988890';
  
  Logger.log(`Sending test SMS to ${testPhone}: ${message}`);
  
  try {
    const success = sendSingleSMS(testPhone, message, 'Test User', 'TEST');
    
    return {
      success: success,
      phone: testPhone,
      message: message,
      error: success ? null : 'Failed to send SMS'
    };
    
  } catch (error) {
    Logger.log(`Error in sendTestSMS: ${error.message}`);
    return {
      success: false,
      phone: testPhone,
      message: message,
      error: error.message
    };
  }
}

/**
 * Get customer conversations for inbox display
 */
function getCustomerConversations(limit = 50) {
  try {
    const token = getAccessToken();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;
    
    // Get all customers with conversations
    const url = `${baseUrl}/${CUSTOMER_COMMUNICATIONS_COLLECTION}?pageSize=${limit}`;
    
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      const docs = data.documents || [];
      const customers = [];
      
      docs.forEach(doc => {
        const fields = doc.fields || {};
        const profile = convertFromFirestoreFields(fields.profile?.mapValue?.fields || {});
        const conversations = fields.conversations?.arrayValue?.values || [];
        
        // Get latest message for preview
        const latestMessage = conversations.length > 0 ? 
          convertFromFirestoreFields(conversations[conversations.length - 1].mapValue?.fields || {}) : null;
        
        customers.push({
          customerId: doc.name.split('/').pop(),
          profile: profile,
          latestMessage: latestMessage,
          messageCount: conversations.length,
          conversations: conversations.map(conv => convertFromFirestoreFields(conv.mapValue?.fields || {}))
        });
      });
      
      // Sort by latest message timestamp
      customers.sort((a, b) => {
        const aTime = a.latestMessage?.timestamp ? new Date(a.latestMessage.timestamp).getTime() : 0;
        const bTime = b.latestMessage?.timestamp ? new Date(b.latestMessage.timestamp).getTime() : 0;
        return bTime - aTime;
      });
      
      Logger.log(`Retrieved ${customers.length} customer conversations`);
      return customers;
    }
    
    Logger.log('Failed to fetch conversations: ' + response.getContentText());
    return [];
    
  } catch (error) {
    Logger.log(`Error getting conversations: ${error.message}`);
    return [];
  }
}

/**
 * Send reply to customer via SMS
 */
function sendCustomerReply(customerId, message, agentId = null) {
  try {
    const token = getAccessToken();
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;
    
    // Get customer profile to find phone number
    const customerUrl = `${baseUrl}/${CUSTOMER_COMMUNICATIONS_COLLECTION}/${customerId}`;
    const customerResponse = UrlFetchApp.fetch(customerUrl, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (customerResponse.getResponseCode() !== 200) {
      throw new Error('Customer not found');
    }
    
    const customerData = JSON.parse(customerResponse.getContentText());
    const profile = convertFromFirestoreFields(customerData.fields.profile?.mapValue?.fields || {});
    
    if (!profile.phone) {
      throw new Error('Customer phone number not found');
    }
    
    const phone = profile.phone;
    const customerName = profile.name || 'Customer';
    
    // Send SMS via existing Twilio function
    const success = sendSingleSMS(phone, message, customerName, 'REPLY');
    
    if (success) {
      // Store outbound message in Firestore
      const outboundMessage = {
        customerId: customerId,
        channel: 'sms',
        direction: 'outbound',
        content: message,
        channelData: {
          from: TWILIO_PHONE_NUMBER,
          to: phone
        },
        timestamp: new Date(),
        status: 'sent',
        agentId: agentId
      };
      
      storeCustomerMessage(outboundMessage);
      
      Logger.log(`Reply sent to customer ${customerId}`);
      return { success: true, message: 'Reply sent successfully' };
    } else {
      throw new Error('Failed to send SMS');
    }
    
  } catch (error) {
    Logger.log(`Error sending reply: ${error.message}`);
    return { success: false, error: error.message };
  }
}