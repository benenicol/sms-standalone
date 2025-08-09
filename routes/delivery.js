const express = require('express');
const router = express.Router();
const { fetchOrdersForSMS } = require('../services/shopify');
const { optimizeDeliveryRoute, geocodeAddress, validateOrsConfig } = require('../services/openroute');

/**
 * Determine delivery method using same logic as SMS system
 */
function determineDeliveryMethod(order) {
  console.log('🚚 Determining delivery method for order:', {
    orderNumber: order.orderNumber || order.name,
    deliveryMethod: order.deliveryMethod,
    shipping_lines: order.shipping_lines,
    has_shipping_address: !!order.shipping_address,
    shipping_address: order.shipping_address
  });
  
  // First check if we have a deliveryMethod from Shopify service
  if (order.deliveryMethod) {
    const method = order.deliveryMethod.toLowerCase();
    if (method.includes('pickup') || method.includes('collection')) {
      return 'Pickup';
    }
    if (method.includes('delivery') || method.includes('shipping') || method.includes('home')) {
      return 'Home Delivery';
    }
  }
  
  // Check shipping method title
  if (order.shipping_lines && order.shipping_lines.length > 0) {
    const shippingTitle = order.shipping_lines[0].title.toLowerCase();
    console.log('🚛 Checking shipping title:', shippingTitle);
    
    if (shippingTitle.includes('pickup') || shippingTitle.includes('collection')) {
      return 'Pickup';
    }
    if (shippingTitle.includes('delivery') || shippingTitle.includes('shipping') || shippingTitle.includes('home')) {
      return 'Home Delivery';
    }
  }
  
  // Check if there's a shipping address (more detailed check)
  if (order.shipping_address && 
      (order.shipping_address.address1 || order.shipping_address.city)) {
    console.log('📍 Has shipping address, marking as Home Delivery');
    return 'Home Delivery';
  }
  
  // Check billing address as fallback for home delivery
  if (order.billing_address && order.billing_address.address1 && 
      !order.shipping_address) {
    console.log('💳 No shipping address but has billing address, marking as Home Delivery');
    return 'Home Delivery';
  }
  
  // Default fallback
  console.log('📦 Defaulting to Pickup');
  return 'Pickup';
}

// Farm location coordinates (you can update these to your actual farm location)
const FARM_LOCATION = [151.2093, -33.8688]; // Default to Sydney, update with actual coordinates
const NEWCASTLE_MARKETS = [151.7789, -32.9283]; // Newcastle Markets coordinates

/**
 * Get all unfulfilled orders for truck loading
 */
router.get('/orders', async (req, res) => {
  try {
    const { 
      days = 7,
      limit = 100 
    } = req.query;

    // Fetch unfulfilled orders
    const orders = await fetchOrdersForSMS({
      status: 'any', // Get all statuses
      limit: parseInt(limit),
      days: parseInt(days)
    });

    // Filter for unfulfilled orders only
    const unfulfilledOrders = orders.filter(order => 
      order.fulfillmentStatus === 'unfulfilled' || 
      order.fulfillmentStatus === 'partial'
    );

    // Categorize orders using same logic as SMS system
    const deliveryOrders = [];
    const pickupOrders = [];

    for (const order of unfulfilledOrders) {
      const deliveryMethod = determineDeliveryMethod(order);
      const isPickup = deliveryMethod === 'Pickup';

      // Debug logging for classification
      console.log('🏷️ Order classification:', {
        orderNumber: order.orderNumber,
        deliveryMethod: order.deliveryMethod,
        shipping_lines: order.shipping_lines?.[0]?.title,
        has_shipping_address: !!order.shipping_address,
        has_billing_address: !!order.billing_address,
        tags: order.tags,
        classification: deliveryMethod,
        isPickup: isPickup
      });

      if (isPickup) {
        pickupOrders.push({
          ...order,
          section: 'fridge',
          deliveryType: 'pickup',
          deliveryMethod: 'Pickup'
        });
      } else {
        // For deliveries, store the address (geocoding will be done during optimization)
        const address = order.shipping_address || order.billing_address;
        console.log('📦 Delivery order address:', {
          orderNumber: order.orderNumber,
          address: address ? {
            address1: address.address1,
            city: address.city,
            province: address.province,
            country: address.country
          } : null
        });
        
        deliveryOrders.push({
          ...order,
          section: 'freezer',
          deliveryType: 'delivery',
          deliveryMethod: 'Home Delivery',
          customer: {
            ...order.customer,
            address: address
          },
          hasAddress: !!address
        });
      }
    }

    const result = {
      success: true,
      summary: {
        total: unfulfilledOrders.length,
        deliveries: deliveryOrders.length,
        pickups: pickupOrders.length
      },
      deliveries: deliveryOrders,
      pickups: pickupOrders,
      allOrders: unfulfilledOrders
    };

    console.log('📦 Loaded delivery data:', result.summary);
    res.json(result);

  } catch (error) {
    console.error('Error fetching delivery orders:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      deliveries: [],
      pickups: []
    });
  }
});

/**
 * Optimize delivery route
 */
router.post('/optimize-route', async (req, res) => {
  try {
    const { orders, options = {} } = req.body;

    console.log('🗺️ Route optimization requested for', orders?.length || 0, 'orders');

    if (!orders || orders.length === 0) {
      return res.json({
        success: true,
        optimizedRoute: [],
        packingOrder: [],
        message: 'No orders to optimize'
      });
    }

    // Filter delivery orders and geocode addresses
    const rawDeliveryOrders = orders.filter(order => {
      const isDelivery = order.deliveryType === 'delivery';
      const hasAddress = order.customer?.address && (order.customer.address.address1 || order.customer.address.city);
      console.log('🚚 Order', order.orderNumber, '- isDelivery:', isDelivery, 'hasAddress:', hasAddress);
      return isDelivery && hasAddress;
    });

    console.log('📍 Found', rawDeliveryOrders.length, 'delivery orders with addresses');

    if (rawDeliveryOrders.length === 0) {
      return res.json({
        success: true,
        optimizedRoute: [],
        packingOrder: [],
        message: 'No delivery orders with valid addresses found',
        debug: {
          totalOrders: orders.length,
          deliveryOrders: orders.filter(o => o.deliveryType === 'delivery').length,
          ordersWithAddresses: orders.filter(o => o.customer?.address?.address1).length
        }
      });
    }

    // Geocode all delivery addresses
    console.log('🌍 Geocoding', rawDeliveryOrders.length, 'addresses...');
    const deliveryOrdersWithCoords = [];
    
    for (const order of rawDeliveryOrders) {
      console.log('📍 Geocoding address for order', order.orderNumber);
      const coordinates = await geocodeAddress(order.customer.address);
      
      if (coordinates && coordinates.longitude && coordinates.latitude) {
        deliveryOrdersWithCoords.push({
          ...order,
          customer: {
            ...order.customer,
            address: {
              ...order.customer.address,
              longitude: coordinates.longitude,
              latitude: coordinates.latitude
            }
          }
        });
        console.log('✅ Geocoded order', order.orderNumber, ':', coordinates);
      } else {
        console.log('❌ Failed to geocode order', order.orderNumber);
      }
    }

    console.log('🗺️ Successfully geocoded', deliveryOrdersWithCoords.length, 'out of', rawDeliveryOrders.length, 'orders');

    if (deliveryOrdersWithCoords.length === 0) {
      return res.json({
        success: true,
        optimizedRoute: [],
        packingOrder: [],
        message: 'No delivery addresses could be geocoded. Check addresses are valid.',
        debug: {
          totalDeliveries: rawDeliveryOrders.length,
          successfulGeocoding: deliveryOrdersWithCoords.length
        }
      });
    }

    console.log('🌐 Starting route optimization with OpenRoute Service...');
    const optimization = await optimizeDeliveryRoute(
      deliveryOrdersWithCoords, 
      FARM_LOCATION, 
      options
    );

    console.log('✅ Route optimization completed:', optimization.success ? 'Success' : 'Failed');
    res.json(optimization);

  } catch (error) {
    console.error('❌ Error optimizing route:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      optimizedRoute: [],
      packingOrder: []
    });
  }
});

/**
 * Track loaded orders
 */
router.post('/track-loading', async (req, res) => {
  try {
    const { orderNumber, section, action = 'load' } = req.body;

    if (!orderNumber || !section) {
      return res.status(400).json({
        success: false,
        error: 'Order number and section are required'
      });
    }

    // Here you would typically update a database to track loading status
    // For now, we'll return a success response
    const result = {
      success: true,
      orderNumber,
      section,
      action,
      timestamp: new Date().toISOString(),
      message: `Order ${orderNumber} ${action}ed in ${section} section`
    };

    console.log('📦 Loading tracked:', result.message);
    res.json(result);

  } catch (error) {
    console.error('Error tracking loading:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get loading status for all orders
 */
router.get('/loading-status', async (req, res) => {
  try {
    // This would typically fetch from a database
    // For now, return empty status
    res.json({
      success: true,
      loadedOrders: {},
      summary: {
        freezerLoaded: 0,
        fridgeLoaded: 0,
        totalLoaded: 0
      }
    });

  } catch (error) {
    console.error('Error fetching loading status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Split deliveries between drivers
 */
router.post('/split-route', async (req, res) => {
  try {
    const { orders, splitPoint, driver1Name = 'Driver 1', driver2Name = 'Driver 2' } = req.body;

    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({
        success: false,
        error: 'Orders array is required'
      });
    }

    const splitIndex = splitPoint || Math.floor(orders.length / 2);
    
    const driver1Orders = orders.slice(0, splitIndex);
    const driver2Orders = orders.slice(splitIndex);

    const result = {
      success: true,
      split: {
        driver1: {
          name: driver1Name,
          orders: driver1Orders,
          count: driver1Orders.length
        },
        driver2: {
          name: driver2Name,
          orders: driver2Orders,
          count: driver2Orders.length
        }
      },
      summary: {
        totalOrders: orders.length,
        driver1Count: driver1Orders.length,
        driver2Count: driver2Orders.length
      }
    };

    console.log('🚛 Route split:', result.summary);
    res.json(result);

  } catch (error) {
    console.error('Error splitting route:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Validate OpenRoute Service configuration
 */
router.get('/validate-ors', async (req, res) => {
  try {
    const isValid = await validateOrsConfig();
    
    res.json({
      success: true,
      orsConfigured: isValid,
      message: isValid ? 'ORS API configured correctly' : 'ORS API configuration issue',
      apiKey: process.env.ORS_API_KEY ? 'Set' : 'Not set'
    });

  } catch (error) {
    console.error('Error validating ORS:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      orsConfigured: false
    });
  }
});

/**
 * Test geocoding for debugging
 */
router.post('/test-geocoding', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    console.log('🌍 Testing geocoding for address:', address);
    const coordinates = await geocodeAddress(address);
    
    res.json({
      success: true,
      address,
      coordinates,
      message: coordinates ? 'Geocoding successful' : 'No coordinates found'
    });

  } catch (error) {
    console.error('Error testing geocoding:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;