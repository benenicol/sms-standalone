const express = require('express');
const router = express.Router();
const { fetchOrdersForSMS } = require('../services/shopify');
const { optimizeDeliveryRoute, geocodeAddress, validateOrsConfig } = require('../services/openroute');

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

    // Categorize orders
    const deliveryOrders = [];
    const pickupOrders = [];

    for (const order of unfulfilledOrders) {
      // Determine delivery method more accurately
      const isPickup = order.deliveryMethod === 'Pickup' || 
                      (order.tags && order.tags.some(tag => 
                        tag.toLowerCase().includes('pickup') || 
                        tag.toLowerCase().includes('market')
                      ));

      if (isPickup) {
        pickupOrders.push({
          ...order,
          section: 'fridge',
          deliveryType: 'pickup'
        });
      } else {
        // For deliveries, try to geocode the address
        const address = order.shipping_address || order.billing_address;
        if (address) {
          const coordinates = await geocodeAddress(address);
          deliveryOrders.push({
            ...order,
            section: 'freezer',
            deliveryType: 'delivery',
            customer: {
              ...order.customer,
              address: {
                ...address,
                longitude: coordinates?.longitude,
                latitude: coordinates?.latitude
              }
            }
          });
        } else {
          deliveryOrders.push({
            ...order,
            section: 'freezer',
            deliveryType: 'delivery'
          });
        }
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

    if (!orders || orders.length === 0) {
      return res.json({
        success: true,
        optimizedRoute: [],
        packingOrder: [],
        message: 'No orders to optimize'
      });
    }

    // Filter delivery orders only
    const deliveryOrders = orders.filter(order => 
      order.deliveryType === 'delivery' && 
      order.customer?.address?.longitude && 
      order.customer?.address?.latitude
    );

    if (deliveryOrders.length === 0) {
      return res.json({
        success: true,
        optimizedRoute: [],
        packingOrder: [],
        message: 'No delivery orders with valid addresses found'
      });
    }

    const optimization = await optimizeDeliveryRoute(
      deliveryOrders, 
      FARM_LOCATION, 
      options
    );

    res.json(optimization);

  } catch (error) {
    console.error('Error optimizing route:', error);
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
      message: isValid ? 'ORS API configured correctly' : 'ORS API configuration issue'
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

module.exports = router;