const admin = require('firebase-admin');
const { getShopifyCustomerData } = require('./shopify');

// Initialize Firebase Admin with error handling
if (!admin.apps.length) {
  try {
    console.log('🔥 Initializing Firebase Admin...');
    
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is required');
    }
    
    if (!process.env.FIRESTORE_PROJECT_ID) {
      throw new Error('FIRESTORE_PROJECT_ID environment variable is required');
    }
    
    console.log('📋 Parsing Firebase service account...');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    console.log('🔧 Creating Firebase app...');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIRESTORE_PROJECT_ID
    });
    
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    throw error;
  }
}

const db = admin.firestore();
const CUSTOMER_COMMUNICATIONS_COLLECTION = process.env.CUSTOMER_COMMUNICATIONS_COLLECTION || 'customer-communications';

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
 * Get customer ID from phone number (tries Shopify first, then creates fallback)
 */
async function getCustomerIdFromPhone(phoneNumber) {
  try {
    // Try to find customer in Shopify by phone number
    const shopifyCustomer = await getShopifyCustomerData(phoneNumber);
    
    if (shopifyCustomer) {
      console.log(`Found Shopify customer: ${shopifyCustomer.id}`);
      return shopifyCustomer.id.toString();
    }
    
    // Create customer with phone as ID (fallback)
    const newCustomerId = `phone_${phoneNumber.replace(/\D/g, '')}`;
    console.log(`Created phone-based customer ID: ${newCustomerId}`);
    return newCustomerId;
    
  } catch (error) {
    console.error(`Error getting customer ID: ${error.message}`);
    // Fallback to phone-based ID
    return `phone_${phoneNumber.replace(/\D/g, '')}`;
  }
}

/**
 * Store a customer message in Firestore
 */
async function storeCustomerMessage(messageData) {
  try {
    const customerDocRef = db.collection(CUSTOMER_COMMUNICATIONS_COLLECTION).doc(messageData.customerId);
    
    // Get existing customer document
    const customerDoc = await customerDocRef.get();
    
    let customerData;
    if (customerDoc.exists) {
      // Customer exists, get current data
      customerData = customerDoc.data();
      
      // If customer doesn't have Shopify data, try to enrich it
      if (!customerData.profile.shopifyId) {
        const shopifyCustomer = await getShopifyCustomerData(messageData.channelData.from);
        if (shopifyCustomer) {
          const fullName = `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim();
          customerData.profile.name = fullName || customerData.profile.name;
          customerData.profile.email = shopifyCustomer.email || customerData.profile.email;
          customerData.profile.shopifyId = shopifyCustomer.id.toString();
          customerData.profile.updatedAt = new Date().toISOString();
          console.log(`Enriched existing customer with Shopify data: ${fullName} (ID: ${shopifyCustomer.id})`);
        }
      }
    } else {
      // Create new customer - try to get Shopify data first
      const shopifyCustomer = await getShopifyCustomerData(messageData.channelData.from);
      
      if (shopifyCustomer) {
        // Use Shopify customer data
        const fullName = `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim();
        customerData = {
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
        console.log(`Created new customer with Shopify data: ${fullName} (ID: ${shopifyCustomer.id})`);
      } else {
        // Fallback to basic customer
        customerData = {
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
        console.log(`Created new customer without Shopify data: ${messageData.channelData.from}`);
      }
    }
    
    // Add new message to conversations
    const newMessage = {
      id: messageData.channelData.twilioSid || `msg_${Date.now()}`,
      timestamp: messageData.timestamp,
      channel: messageData.channel,
      direction: messageData.direction,
      content: messageData.content,
      channelData: messageData.channelData,
      status: 'received'
    };
    
    customerData.conversations = customerData.conversations || [];
    customerData.conversations.push(newMessage);
    customerData.profile.updatedAt = new Date().toISOString();
    
    // Save to Firestore
    await customerDocRef.set(customerData);
    
    console.log(`✅ Stored message for customer ${messageData.customerId}`);
    return true;
    
  } catch (error) {
    console.error(`Error storing message: ${error.message}`);
    return false;
  }
}

/**
 * Get customer conversations for inbox display
 */
async function getCustomerConversations(limit = 50) {
  try {
    const snapshot = await db.collection(CUSTOMER_COMMUNICATIONS_COLLECTION)
      .limit(limit)
      .get();
    
    const customers = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const conversations = data.conversations || [];
      
      // Get latest message for preview
      const latestMessage = conversations.length > 0 ? 
        conversations[conversations.length - 1] : null;
      
      customers.push({
        customerId: doc.id,
        profile: data.profile,
        latestMessage: latestMessage,
        messageCount: conversations.length,
        conversations: conversations
      });
    });
    
    // Sort by latest message timestamp
    customers.sort((a, b) => {
      const aTime = a.latestMessage?.timestamp ? new Date(a.latestMessage.timestamp).getTime() : 0;
      const bTime = b.latestMessage?.timestamp ? new Date(b.latestMessage.timestamp).getTime() : 0;
      return bTime - aTime;
    });
    
    console.log(`Retrieved ${customers.length} customer conversations`);
    return customers;
    
  } catch (error) {
    console.error(`Error getting conversations: ${error.message}`);
    return [];
  }
}

/**
 * Send reply to customer via SMS
 */
async function sendReplyToCustomer(customerId, message) {
  try {
    const { sendSingleSMS } = require('./twilio');
    
    // Get customer data
    const customerDoc = await db.collection(CUSTOMER_COMMUNICATIONS_COLLECTION).doc(customerId).get();
    
    if (!customerDoc.exists) {
      throw new Error('Customer not found');
    }
    
    const customerData = customerDoc.data();
    const profile = customerData.profile;
    
    if (!profile.phone) {
      throw new Error('Customer phone number not found');
    }
    
    const phone = profile.phone;
    const customerName = profile.name || 'Customer';
    
    // Send SMS
    const success = await sendSingleSMS(phone, message, customerName, 'REPLY');
    
    if (success) {
      // Store outbound message in Firestore
      const outboundMessage = {
        id: `msg_${Date.now()}`,
        timestamp: new Date(),
        channel: 'sms',
        direction: 'outbound',
        content: message,
        channelData: {
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phone
        },
        status: 'sent'
      };
      
      customerData.conversations = customerData.conversations || [];
      customerData.conversations.push(outboundMessage);
      customerData.profile.updatedAt = new Date().toISOString();
      
      await db.collection(CUSTOMER_COMMUNICATIONS_COLLECTION).doc(customerId).set(customerData);
      
      return { 
        success: true, 
        message: `Reply sent to ${customerName} (${phone})` 
      };
    } else {
      return { 
        success: false, 
        error: 'Failed to send SMS' 
      };
    }
    
  } catch (error) {
    console.error(`Error sending reply: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  normalizePhoneNumber,
  getCustomerIdFromPhone,
  storeCustomerMessage,
  getCustomerConversations,
  sendReplyToCustomer
};