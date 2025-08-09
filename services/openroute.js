const axios = require('axios');

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE_URL = 'https://api.openrouteservice.org';

/**
 * OpenRoute Service API integration for route optimization
 */

/**
 * Optimize delivery route using Vehicle Routing Problem (VRP) solver
 */
async function optimizeDeliveryRoute(orders, startLocation, options = {}) {
  try {
    if (!ORS_API_KEY) {
      throw new Error('ORS_API_KEY environment variable not set');
    }

    // Prepare jobs (delivery locations)
    const jobs = orders
      .filter(order => {
        const hasDelivery = order.deliveryType === 'delivery' || order.deliveryMethod === 'Home Delivery';
        const hasCoordinates = order.customer?.address?.longitude && order.customer?.address?.latitude;
        console.log('📍 Filtering order:', order.orderNumber, 'hasDelivery:', hasDelivery, 'hasCoordinates:', hasCoordinates);
        return hasDelivery && hasCoordinates;
      })
      .map((order, index) => ({
        id: parseInt(order.id) || index + 1,
        service: 300, // 5 minutes per delivery
        amount: [1], // Single delivery unit
        location: [
          parseFloat(order.customer.address.longitude),
          parseFloat(order.customer.address.latitude)
        ],
        description: `Order ${order.orderNumber} - ${order.customer.name}`
      }));

    console.log('📦 Prepared jobs for optimization:', jobs.length, 'out of', orders.length, 'orders');

    if (jobs.length === 0) {
      return {
        success: true,
        optimizedRoute: [],
        packingOrder: [],
        totalDistance: 0,
        totalTime: 0,
        message: 'No delivery orders found'
      };
    }

    // Vehicle configuration
    const vehicles = [{
      id: 1,
      profile: 'driving-car',
      start: startLocation, // Farm location
      end: [151.7789, -32.9283], // Newcastle Markets coordinates
      capacity: [jobs.length + 10], // Truck capacity
      ...options.vehicleOptions
    }];

    const requestData = {
      jobs,
      vehicles,
      options: {
        g: true // Return geometry for route visualization
      }
    };

    console.log('🚛 Optimizing route for', jobs.length, 'deliveries');
    
    const response = await axios.post(
      `${ORS_BASE_URL}/optimization`,
      requestData,
      {
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (!response.data || !response.data.routes) {
      throw new Error('Invalid response from ORS API');
    }

    const route = response.data.routes[0];
    const optimizedJobs = route.steps.filter(step => step.type === 'job');
    
    // Create optimized delivery sequence
    const optimizedRoute = optimizedJobs.map(step => {
      const job = jobs.find(j => j.id === step.id);
      const originalOrder = orders.find(o => parseInt(o.id) === step.id);
      return {
        ...originalOrder,
        sequence: step.arrival,
        location: job.location,
        arrivalTime: step.arrival
      };
    });

    // Generate packing order (reverse of delivery sequence)
    const packingOrder = [...optimizedRoute].reverse();

    const result = {
      success: true,
      optimizedRoute,
      packingOrder,
      totalDistance: route.distance,
      totalTime: route.duration,
      geometry: route.geometry,
      summary: {
        deliveries: jobs.length,
        totalDistance: Math.round(route.distance / 1000 * 100) / 100, // km
        totalTime: Math.round(route.duration / 60), // minutes
        startLocation,
        endLocation: [151.7789, -32.9283] // Newcastle Markets
      }
    };

    console.log('✅ Route optimized:', result.summary);
    return result;

  } catch (error) {
    console.error('❌ Route optimization error:', error.message);
    return {
      success: false,
      error: error.message,
      optimizedRoute: [],
      packingOrder: []
    };
  }
}

/**
 * Get address coordinates using geocoding
 */
async function geocodeAddress(address) {
  try {
    if (!ORS_API_KEY) {
      console.error('❌ ORS_API_KEY environment variable not set');
      throw new Error('ORS_API_KEY environment variable not set');
    }

    const query = `${address.address1} ${address.city} ${address.province || ''} ${address.country || 'Australia'}`.trim();
    console.log('🌍 Geocoding query:', query);
    
    const response = await axios.get(
      `${ORS_BASE_URL}/geocode/search`,
      {
        params: {
          api_key: ORS_API_KEY,
          text: query,
          size: 1,
          'boundary.country': 'AU' // Limit to Australia
        },
        timeout: 10000
      }
    );

    console.log('📡 ORS API Response status:', response.status);
    console.log('📡 ORS API Response data:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.features && response.data.features.length > 0) {
      const feature = response.data.features[0];
      const result = {
        longitude: feature.geometry.coordinates[0],
        latitude: feature.geometry.coordinates[1],
        confidence: feature.properties.confidence || 0
      };
      console.log('✅ Geocoding successful:', result);
      return result;
    }

    console.log('❌ No geocoding results found for query:', query);
    return null;

  } catch (error) {
    console.error('❌ Geocoding error for query:', `${address.address1} ${address.city}`);
    console.error('❌ Error details:', error.message);
    if (error.response) {
      console.error('❌ API Response status:', error.response.status);
      console.error('❌ API Response data:', error.response.data);
    }
    return null;
  }
}

/**
 * Calculate distance matrix for multiple locations
 */
async function calculateDistanceMatrix(locations) {
  try {
    if (!ORS_API_KEY) {
      throw new Error('ORS_API_KEY environment variable not set');
    }

    const response = await axios.post(
      `${ORS_BASE_URL}/v2/matrix/driving-car`,
      {
        locations: locations,
        metrics: ['distance', 'duration']
      },
      {
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return {
      success: true,
      distances: response.data.distances,
      durations: response.data.durations
    };

  } catch (error) {
    console.error('❌ Distance matrix error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validate ORS API configuration
 */
async function validateOrsConfig() {
  try {
    if (!ORS_API_KEY) {
      throw new Error('Missing ORS API key');
    }

    // Test with a simple geocoding request
    const response = await axios.get(
      `${ORS_BASE_URL}/geocode/search`,
      {
        params: {
          api_key: ORS_API_KEY,
          text: 'Sydney, Australia',
          size: 1
        },
        timeout: 10000
      }
    );

    console.log('✅ OpenRoute Service connection verified');
    return true;

  } catch (error) {
    console.error('❌ ORS configuration error:', error.message);
    return false;
  }
}

module.exports = {
  optimizeDeliveryRoute,
  geocodeAddress,
  calculateDistanceMatrix,
  validateOrsConfig
};