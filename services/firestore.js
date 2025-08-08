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
      status: 'received',
      isRead: messageData.direction === 'outbound', // Outbound messages are automatically "read"
      readAt: messageData.direction === 'outbound' ? messageData.timestamp : null
    };
    
    customerData.conversations = customerData.conversations || [];
    customerData.conversations.push(newMessage);
    
    // Update profile with unread count and last activity
    customerData.profile.updatedAt = new Date().toISOString();
    customerData.profile.lastActivity = messageData.timestamp;
    
    // Update unread count for inbound messages
    if (messageData.direction === 'inbound') {
      customerData.profile.unreadCount = (customerData.profile.unreadCount || 0) + 1;
    }
    
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
 * Convert Firestore Timestamp to JavaScript Date
 */
function convertFirestoreTimestamp(timestamp) {
  if (!timestamp) return null;
  
  // Handle Firestore Timestamp objects
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // Handle regular JavaScript Date objects
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  // Handle string timestamps
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

/**
 * Process conversations to convert timestamps
 */
function processConversationsTimestamps(conversations) {
  return conversations.map(message => ({
    ...message,
    timestamp: convertFirestoreTimestamp(message.timestamp)
  }));
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
      
      // Convert timestamps in all conversations
      const processedConversations = processConversationsTimestamps(conversations);
      
      // Get latest message for preview
      const latestMessage = processedConversations.length > 0 ? 
        processedConversations[processedConversations.length - 1] : null;
      
      // Convert profile timestamps and set lastActivity if missing
      const profile = {
        ...data.profile,
        createdAt: convertFirestoreTimestamp(data.profile?.createdAt),
        updatedAt: convertFirestoreTimestamp(data.profile?.updatedAt),
        lastActivity: convertFirestoreTimestamp(data.profile?.lastActivity) || (latestMessage ? latestMessage.timestamp : null)
      };
      
      customers.push({
        customerId: doc.id,
        profile: profile,
        latestMessage: latestMessage,
        messageCount: processedConversations.length,
        unreadCount: profile.unreadCount || 0,
        conversations: processedConversations
      });
    });
    
    // Sort by unread status first, then by latest message timestamp
    customers.sort((a, b) => {
      // Unread messages first
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      
      // Then by latest activity
      const aTime = a.latestMessage?.timestamp ? a.latestMessage.timestamp.getTime() : 0;
      const bTime = b.latestMessage?.timestamp ? b.latestMessage.timestamp.getTime() : 0;
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
        status: 'sent',
        isRead: true, // Outbound messages are automatically "read"
        readAt: new Date()
      };
      
      customerData.conversations = customerData.conversations || [];
      customerData.conversations.push(outboundMessage);
      customerData.profile.updatedAt = new Date().toISOString();
      customerData.profile.lastActivity = new Date();
      
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

/**
 * Mark conversation as read for a customer
 */
async function markConversationAsRead(customerId) {
  try {
    const customerDocRef = db.collection(CUSTOMER_COMMUNICATIONS_COLLECTION).doc(customerId);
    const customerDoc = await customerDocRef.get();
    
    if (!customerDoc.exists) {
      throw new Error('Customer not found');
    }
    
    const customerData = customerDoc.data();
    const conversations = customerData.conversations || [];
    
    // Mark all unread messages as read
    let hasUnreadMessages = false;
    const now = new Date();
    
    const updatedConversations = conversations.map(message => {
      if (message.direction === 'inbound' && !message.isRead) {
        hasUnreadMessages = true;
        return {
          ...message,
          isRead: true,
          readAt: now
        };
      }
      return message;
    });
    
    if (hasUnreadMessages) {
      // Update conversations and reset unread count
      customerData.conversations = updatedConversations;
      customerData.profile.unreadCount = 0;
      customerData.profile.updatedAt = now.toISOString();
      
      await customerDocRef.set(customerData);
      console.log(`✅ Marked conversation as read for customer ${customerId}`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error(`Error marking conversation as read: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  normalizePhoneNumber,
  getCustomerIdFromPhone,
  storeCustomerMessage,
  getCustomerConversations,
  sendReplyToCustomer,
  markConversationAsRead
};