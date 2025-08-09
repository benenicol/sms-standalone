const axios = require('axios');

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2023-10';

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
    return '+' + phoneNumber.replace(/\D/g, '');
  }
  
  return '+' + digits;
}

/**
 * Search Shopify for customer by phone number (tries multiple formats)
 */
async function getShopifyCustomerData(phoneNumber) {
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
      
      try {
        const response = await axios.get(url, {
          headers: { 'X-Shopify-Access-Token': TOKEN },
          timeout: 10000
        });
        
        if (response.data.customers && response.data.customers.length > 0) {
          console.log(`Found Shopify customer data with phone format: ${phone}`);
          return response.data.customers[0];
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          console.error(`Error searching Shopify with phone ${phone}:`, error.message);
        }
      }
    }
    
    return null;
    
  } catch (error) {
    console.error(`Error getting Shopify customer data: ${error.message}`);
    return null;
  }
}

/**
 * Get Shopify customer ID by phone number
 */
async function getShopifyCustomerIdByPhone(phoneNumber) {
  try {
    const customer = await getShopifyCustomerData(phoneNumber);
    return customer ? customer.id.toString() : null;
  } catch (error) {
    console.error(`Error searching Shopify customers: ${error.message}`);
    return null;
  }
}

/**
 * Fetch orders for SMS notifications
 */
async function fetchOrdersForSMS({ status = 'fulfilled', limit = 50, days = 7, tag = null }) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString();
    
    let url = `https://${SHOP}/admin/api/${API_VERSION}/orders.json?status=${status}&limit=${limit}&created_at_min=${sinceDate}`;
    
    const response = await axios.get(url, {
      headers: { 'X-Shopify-Access-Token': TOKEN },
      timeout: 15000
    });
    
    let orders = response.data.orders || [];
    
    // Filter by tag if specified
    if (tag) {
      orders = orders.filter(order => {
        const orderTags = order.tags ? order.tags.split(',').map(t => t.trim().toLowerCase()) : [];
        return orderTags.includes(tag.toLowerCase());
      });
    }
    
    // Process orders for SMS data
    const processedOrders = orders.map(order => {
      const customerName = order.customer ? 
        `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : 
        'Unknown Customer';
      
      const phone = order.customer?.phone || 
                   order.billing_address?.phone || 
                   order.shipping_address?.phone || '';
      
      // Determine delivery method from shipping lines
      let deliveryMethod = null;
      const shippingLines = order.shipping_lines || [];
      
      // Primary: Use shipping line title to determine delivery method
      if (shippingLines.length > 0) {
        const shippingTitle = shippingLines[0].title.toLowerCase();
        const shippingCode = shippingLines[0].code?.toLowerCase() || '';
        
        console.log(`🚚 Analyzing shipping for order ${order.order_number}:`, {
          title: shippingLines[0].title,
          code: shippingLines[0].code,
          source: shippingLines[0].source,
          price: shippingLines[0].price
        });
        
        // Check for pickup keywords in title or code
        if (shippingTitle.includes('pickup') || 
            shippingTitle.includes('collection') || 
            shippingTitle.includes('collect') ||
            shippingTitle.includes('market') ||
            shippingCode.includes('pickup') ||
            shippingCode.includes('collection')) {
          deliveryMethod = 'Pickup';
        }
        // Check for delivery keywords in title or code
        else if (shippingTitle.includes('delivery') || 
                 shippingTitle.includes('shipping') || 
                 shippingTitle.includes('post') ||
                 shippingTitle.includes('courier') ||
                 shippingTitle.includes('express') ||
                 shippingCode.includes('delivery') ||
                 shippingCode.includes('shipping')) {
          deliveryMethod = 'Home Delivery';
        }
        // Store the original shipping title for manual review
        else {
          deliveryMethod = shippingLines[0].title;
          console.log(`⚠️ Unknown shipping method for order ${order.order_number}: "${shippingLines[0].title}"`);
        }
      }
      
      // Fallback: No shipping lines means likely pickup or special handling
      if (!deliveryMethod) {
        deliveryMethod = 'Unknown';
      }
      
      // Create a readable order description from line items
      const orderDescription = order.line_items && order.line_items.length > 0
        ? order.line_items.map(item => {
            if (item.quantity > 1) {
              return `${item.quantity} x ${item.name}`;
            }
            return item.name;
          }).join(', ')
        : 'order';

      // Enhanced address information for delivery
      const shippingAddress = order.shipping_address;
      const billingAddress = order.billing_address;
      const deliveryAddress = shippingAddress || billingAddress;

      return {
        id: order.id,
        orderNumber: order.order_number || order.name,
        name: order.name, // Shopify order name (e.g., #1001)
        customer: {
          id: order.customer?.id,
          name: customerName,
          phone: phone,
          email: order.customer?.email,
          first_name: order.customer?.first_name,
          last_name: order.customer?.last_name
        },
        deliveryMethod,
        fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
        financialStatus: order.financial_status || 'pending',
        tags: order.tags ? order.tags.split(',').map(tag => tag.trim()) : [],
        createdAt: order.created_at,
        totalPrice: order.total_price,
        total_price: order.total_price,
        subscriptionItems: orderDescription,
        shipping_lines: order.shipping_lines || [],
        shipping_address: shippingAddress,
        billing_address: billingAddress,
        lineItems: order.line_items?.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          variant_title: item.variant_title
        })) || []
      };
    });
    
    console.log(`Fetched ${processedOrders.length} orders for SMS`);
    return processedOrders;
    
  } catch (error) {
    console.error(`Error fetching orders: ${error.message}`);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
}

module.exports = {
  getShopifyCustomerData,
  getShopifyCustomerIdByPhone,
  fetchOrdersForSMS,
  normalizePhoneNumber
};