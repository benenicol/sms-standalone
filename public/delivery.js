// Global state for delivery management
let allOrders = [];
let deliveryOrders = [];
let pickupOrders = [];
let loadedOrders = {};
let optimizedRoute = null;
let scannerActive = false;
let scanBuffer = '';
let scanTimeout = null;

// Initialize the delivery application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚛 Delivery system loaded');
    
    updateStatus('ready', 'System Ready');
    setupEventListeners();
    
    // Focus on document to capture barcode scanner input
    document.addEventListener('focus', () => {
        console.log('📱 Document focused - ready for barcode input');
    });
});

function setupEventListeners() {
    console.log('🔧 Setting up delivery event listeners...');
    
    // Tab buttons
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', function(e) {
            const tabName = this.getAttribute('data-tab');
            showTab(tabName, e);
        });
    });
    
    // Main action buttons
    document.getElementById('load-orders-btn').addEventListener('click', loadUnfulfilledOrders);
    document.getElementById('scan-mode-btn').addEventListener('click', toggleScannerMode);
    document.getElementById('optimize-btn').addEventListener('click', optimizeRoute);
    
    // Route planning buttons
    document.getElementById('optimize-route-btn').addEventListener('click', optimizeRoute);
    document.getElementById('reset-route-btn').addEventListener('click', resetRoute);
    
    // Driver count change
    document.getElementById('driver-count').addEventListener('change', function() {
        const splitGroup = document.getElementById('split-point-group');
        splitGroup.style.display = this.value === '2' ? 'block' : 'none';
    });
    
    // Export buttons
    document.getElementById('export-loading-list').addEventListener('click', exportLoadingList);
    document.getElementById('export-route-sheet').addEventListener('click', exportRouteSheet);
    
    // Modal controls
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('confirm-load').addEventListener('click', confirmLoadOrder);
    document.getElementById('mark-unloaded').addEventListener('click', markOrderUnloaded);
    
    // Manual input for scanner
    document.getElementById('manual-submit').addEventListener('click', handleManualInput);
    document.getElementById('manual-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleManualInput();
        }
    });
    
    // Global keyboard listener for USB barcode scanner
    document.addEventListener('keydown', handleBarcodeInput);
    
    // Logout button
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    console.log('✅ Delivery event listeners set up');
}

// Handle USB barcode scanner input
function handleBarcodeInput(event) {
    // Only process if scanner mode is active
    if (!scannerActive) return;
    
    // Ignore if user is typing in an input field
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }
    
    // Clear previous timeout
    if (scanTimeout) {
        clearTimeout(scanTimeout);
    }
    
    // Handle Enter key (end of barcode scan)
    if (event.key === 'Enter') {
        event.preventDefault();
        if (scanBuffer.trim()) {
            processBarcodeInput(scanBuffer.trim());
            scanBuffer = '';
        }
        return;
    }
    
    // Accumulate barcode characters
    if (event.key.length === 1) { // Single character keys only
        scanBuffer += event.key;
        
        // Auto-process after 100ms of no input (typical scanner behavior)
        scanTimeout = setTimeout(() => {
            if (scanBuffer.trim()) {
                processBarcodeInput(scanBuffer.trim());
                scanBuffer = '';
            }
        }, 100);
    }
}

// Process scanned barcode input
function processBarcodeInput(barcode) {
    console.log('📱 Barcode scanned:', barcode);
    
    // Find matching order
    const order = findOrderByNumber(barcode);
    
    if (order) {
        showOrderDetails(order, barcode);
        updateRecentScans(barcode, true);
    } else {
        showError(`Order ${barcode} not found in current order list`);
        updateRecentScans(barcode, false);
    }
}

// Handle manual input
function handleManualInput() {
    const input = document.getElementById('manual-input');
    const orderNumber = input.value.trim();
    
    if (orderNumber) {
        processBarcodeInput(orderNumber);
        input.value = '';
    }
}

// Find order by number in current order list
function findOrderByNumber(orderNumber) {
    // Try exact match first
    let order = allOrders.find(o => 
        o.orderNumber === orderNumber || 
        String(o.id) === orderNumber ||
        o.name === orderNumber
    );
    
    // Try partial match if no exact match
    if (!order) {
        order = allOrders.find(o => 
            String(o.orderNumber).includes(orderNumber) ||
            String(o.id).includes(orderNumber) ||
            (o.name && o.name.includes(orderNumber))
        );
    }
    
    return order;
}

// Toggle scanner mode
function toggleScannerMode() {
    scannerActive = !scannerActive;
    const btn = document.getElementById('scan-mode-btn');
    const scannerInterface = document.getElementById('scanner-interface');
    
    if (scannerActive) {
        btn.textContent = '🔴 Stop Scanner';
        btn.classList.add('active');
        scannerInterface.style.display = 'block';
        updateStatus('scanning', 'Scanner Active - Ready for barcode input');
        
        // Focus the manual input for immediate typing
        setTimeout(() => {
            document.getElementById('manual-input').focus();
        }, 100);
        
        console.log('📱 Scanner mode activated');
    } else {
        btn.textContent = '📱 Start Barcode Scanner';
        btn.classList.remove('active');
        scannerInterface.style.display = 'none';
        updateStatus('ready', 'Scanner Inactive');
        scanBuffer = '';
        console.log('📱 Scanner mode deactivated');
    }
}

// Load unfulfilled orders
async function loadUnfulfilledOrders() {
    try {
        updateStatus('loading', 'Loading unfulfilled orders...');
        
        const response = await fetch('/api/delivery/orders?days=14');
        const data = await response.json();
        
        if (data.success) {
            allOrders = data.allOrders || [];
            deliveryOrders = data.deliveries || [];
            pickupOrders = data.pickups || [];
            
            displayOrders();
            updateOrderCounts();
            updateStatus('ready', `${data.summary.total} orders loaded`);
            
            // Enable action buttons
            document.getElementById('optimize-btn').disabled = deliveryOrders.length === 0;
            document.getElementById('scan-mode-btn').disabled = false;
            
            console.log('📦 Orders loaded:', data.summary);
        } else {
            throw new Error(data.error || 'Failed to load orders');
        }
        
    } catch (error) {
        console.error('Error loading orders:', error);
        updateStatus('error', 'Failed to load orders');
        showError('Failed to load orders: ' + error.message);
    }
}

// Display orders in truck sections
function displayOrders() {
    displayDeliveryOrders();
    displayPickupOrders();
}

// Display delivery orders in freezer section
function displayDeliveryOrders() {
    const container = document.getElementById('freezer-content');
    
    if (deliveryOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-section">
                <p>No delivery orders loaded</p>
                <p class="section-help">Delivery orders will appear here</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="order-list">';
    deliveryOrders.forEach((order, index) => {
        const isLoaded = loadedOrders[order.id];
        const customerName = order.customer?.name || 'Unknown Customer';
        const address = order.customer?.address;
        const addressText = address ? 
            `${address.address1 || ''} ${address.city || ''}`.trim() : 
            'No address';
        
        html += `
            <div class="order-item ${isLoaded ? 'loaded' : ''}" data-order-id="${order.id}">
                <div class="order-header">
                    <span class="order-number">#${order.orderNumber}</span>
                    <span class="load-status">${isLoaded ? '✅ Loaded' : '📦 Not Loaded'}</span>
                </div>
                <div class="order-details">
                    <div class="customer-info">
                        <strong>${customerName}</strong>
                        <div class="order-address">${addressText}</div>
                    </div>
                    <div class="order-items">${order.subscriptionItems || 'Order items'}</div>
                </div>
                <div class="order-actions">
                    <button onclick="showOrderDetails('${order.id}')" class="btn btn-small btn-secondary">View Details</button>
                    <button onclick="toggleOrderLoaded('${order.id}')" class="btn btn-small ${isLoaded ? 'btn-warning' : 'btn-success'}">
                        ${isLoaded ? 'Unload' : 'Mark Loaded'}
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Display pickup orders in fridge section
function displayPickupOrders() {
    const container = document.getElementById('fridge-content');
    
    if (pickupOrders.length === 0) {
        container.innerHTML = `
            <div class="empty-section">
                <p>No pickup orders loaded</p>
                <p class="section-help">Pickup orders will appear here</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="order-list">';
    pickupOrders.forEach((order, index) => {
        const isLoaded = loadedOrders[order.id];
        const customerName = order.customer?.name || 'Unknown Customer';
        
        html += `
            <div class="order-item ${isLoaded ? 'loaded' : ''}" data-order-id="${order.id}">
                <div class="order-header">
                    <span class="order-number">#${order.orderNumber}</span>
                    <span class="load-status">${isLoaded ? '✅ Loaded' : '📦 Not Loaded'}</span>
                </div>
                <div class="order-details">
                    <div class="customer-info">
                        <strong>${customerName}</strong>
                        <div class="pickup-info">Newcastle Markets Pickup</div>
                    </div>
                    <div class="order-items">${order.subscriptionItems || 'Order items'}</div>
                </div>
                <div class="order-actions">
                    <button onclick="showOrderDetails('${order.id}')" class="btn btn-small btn-secondary">View Details</button>
                    <button onclick="toggleOrderLoaded('${order.id}')" class="btn btn-small ${isLoaded ? 'btn-warning' : 'btn-success'}">
                        ${isLoaded ? 'Unload' : 'Mark Loaded'}
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Update order counts display
function updateOrderCounts() {
    const total = allOrders.length;
    const deliveries = deliveryOrders.length;
    const pickups = pickupOrders.length;
    const loaded = Object.keys(loadedOrders).length;
    
    document.getElementById('order-counts').textContent = 
        `${total} total orders (${deliveries} deliveries, ${pickups} pickups) - ${loaded} loaded`;
    
    document.getElementById('freezer-count').textContent = `${deliveries} orders`;
    document.getElementById('fridge-count').textContent = `${pickups} orders`;
    
    // Update progress bars
    updateProgressBars();
}

// Update progress bars
function updateProgressBars() {
    const freezerLoaded = deliveryOrders.filter(o => loadedOrders[o.id]).length;
    const fridgeLoaded = pickupOrders.filter(o => loadedOrders[o.id]).length;
    
    const freezerProgress = deliveryOrders.length > 0 ? (freezerLoaded / deliveryOrders.length) * 100 : 0;
    const fridgeProgress = pickupOrders.length > 0 ? (fridgeLoaded / pickupOrders.length) * 100 : 0;
    
    document.getElementById('freezer-progress').style.width = `${freezerProgress}%`;
    document.getElementById('fridge-progress').style.width = `${fridgeProgress}%`;
    
    document.getElementById('freezer-progress-text').textContent = 
        `${freezerLoaded} / ${deliveryOrders.length} loaded`;
    document.getElementById('fridge-progress-text').textContent = 
        `${fridgeLoaded} / ${pickupOrders.length} loaded`;
}

// Show order details modal
function showOrderDetails(orderId, scannedCode = null) {
    const order = allOrders.find(o => o.id === orderId || String(o.id) === orderId);
    
    if (!order) {
        showError('Order not found');
        return;
    }
    
    const modal = document.getElementById('order-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    title.textContent = `Order #${order.orderNumber}`;
    
    const customerName = order.customer?.name || 'Unknown Customer';
    const address = order.customer?.address;
    const isLoaded = loadedOrders[order.id];
    
    let addressHtml = '';
    if (order.deliveryType === 'delivery' && address) {
        addressHtml = `
            <div class="detail-section">
                <h4>Delivery Address</h4>
                <p>${address.address1 || ''}<br>
                   ${address.city || ''} ${address.province || ''} ${address.zip || ''}</p>
            </div>
        `;
    } else if (order.deliveryType === 'pickup') {
        addressHtml = `
            <div class="detail-section">
                <h4>Pickup Location</h4>
                <p>Newcastle Markets</p>
            </div>
        `;
    }
    
    body.innerHTML = `
        <div class="order-detail">
            <div class="detail-section">
                <h4>Customer</h4>
                <p><strong>${customerName}</strong></p>
                ${order.customer?.phone ? `<p>📞 ${order.customer.phone}</p>` : ''}
            </div>
            
            ${addressHtml}
            
            <div class="detail-section">
                <h4>Order Items</h4>
                <p>${order.subscriptionItems || 'Order items not available'}</p>
            </div>
            
            <div class="detail-section">
                <h4>Loading Details</h4>
                <p><strong>Section:</strong> ${order.section === 'freezer' ? '🧊 Freezer' : '❄️ Fridge'}</p>
                <p><strong>Status:</strong> ${isLoaded ? '✅ Loaded' : '📦 Not Loaded'}</p>
                ${scannedCode ? `<p><strong>Scanned Code:</strong> ${scannedCode}</p>` : ''}
            </div>
        </div>
    `;
    
    // Update modal buttons
    const confirmBtn = document.getElementById('confirm-load');
    const unloadBtn = document.getElementById('mark-unloaded');
    
    confirmBtn.textContent = isLoaded ? '✅ Already Loaded' : '✅ Confirm Loaded';
    confirmBtn.disabled = isLoaded;
    unloadBtn.style.display = isLoaded ? 'inline-block' : 'none';
    
    // Store current order ID for modal actions
    modal.setAttribute('data-order-id', order.id);
    
    modal.style.display = 'flex';
}

// Confirm load order from modal
function confirmLoadOrder() {
    const modal = document.getElementById('order-modal');
    const orderId = modal.getAttribute('data-order-id');
    
    if (orderId) {
        toggleOrderLoaded(orderId);
        closeModal();
    }
}

// Mark order as unloaded from modal
function markOrderUnloaded() {
    const modal = document.getElementById('order-modal');
    const orderId = modal.getAttribute('data-order-id');
    
    if (orderId) {
        toggleOrderLoaded(orderId);
        closeModal();
    }
}

// Toggle order loaded status
async function toggleOrderLoaded(orderId) {
    const order = allOrders.find(o => String(o.id) === String(orderId));
    
    if (!order) {
        showError('Order not found');
        return;
    }
    
    const wasLoaded = loadedOrders[orderId];
    const action = wasLoaded ? 'unload' : 'load';
    
    try {
        // Track loading status
        const response = await fetch('/api/delivery/track-loading', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderNumber: order.orderNumber,
                section: order.section,
                action: action
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Update local state
            if (wasLoaded) {
                delete loadedOrders[orderId];
            } else {
                loadedOrders[orderId] = {
                    timestamp: new Date().toISOString(),
                    section: order.section
                };
            }
            
            // Refresh displays
            displayOrders();
            updateOrderCounts();
            updateLoadingHistory(order, action);
            
            console.log(`📦 Order ${order.orderNumber} ${action}ed`);
        } else {
            throw new Error(result.error || 'Failed to track loading');
        }
        
    } catch (error) {
        console.error('Error tracking order loading:', error);
        showError('Failed to update loading status: ' + error.message);
    }
}

// Update recent scans display
function updateRecentScans(barcode, found) {
    const scanList = document.querySelector('#recent-scans .scan-list');
    const timestamp = new Date().toLocaleTimeString();
    
    const scanItem = document.createElement('div');
    scanItem.className = `scan-item ${found ? 'found' : 'not-found'}`;
    scanItem.innerHTML = `
        <span class="scan-code">${barcode}</span>
        <span class="scan-time">${timestamp}</span>
        <span class="scan-status">${found ? '✅' : '❌'}</span>
    `;
    
    // Add to top of list
    scanList.insertBefore(scanItem, scanList.firstChild);
    
    // Keep only last 10 scans
    while (scanList.children.length > 10) {
        scanList.removeChild(scanList.lastChild);
    }
    
    // Remove empty message if present
    const emptyMsg = scanList.querySelector('.empty-scans');
    if (emptyMsg) {
        emptyMsg.remove();
    }
}

// Update loading history
function updateLoadingHistory(order, action) {
    const historyList = document.querySelector('.history-list');
    const timestamp = new Date().toLocaleString();
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
        <div class="history-details">
            <strong>#${order.orderNumber}</strong> - ${order.customer?.name || 'Unknown'}
            <div class="history-meta">
                ${action === 'load' ? '✅ Loaded' : '❌ Unloaded'} in ${order.section} section at ${timestamp}
            </div>
        </div>
    `;
    
    // Add to top of list
    historyList.insertBefore(historyItem, historyList.firstChild);
    
    // Remove empty message if present
    const emptyMsg = historyList.querySelector('.empty-history');
    if (emptyMsg) {
        emptyMsg.remove();
    }
}

// Optimize delivery route
async function optimizeRoute() {
    try {
        updateStatus('processing', 'Optimizing delivery route...');
        
        console.log('🗺️ Starting route optimization...');
        console.log('📦 Delivery orders:', deliveryOrders.length);
        console.log('🏪 Pickup orders:', pickupOrders.length);
        
        if (deliveryOrders.length === 0) {
            showError('No delivery orders to optimize. Make sure you have orders with delivery addresses.');
            updateStatus('ready', 'No deliveries to optimize');
            return;
        }

        // Log orders with addresses for debugging
        const ordersWithAddresses = deliveryOrders.filter(order => 
            order.customer?.address?.longitude && order.customer?.address?.latitude
        );
        console.log('📍 Orders with coordinates:', ordersWithAddresses.length, 'out of', deliveryOrders.length);
        
        const response = await fetch('/api/delivery/optimize-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orders: deliveryOrders,
                options: {}
            })
        });
        
        const result = await response.json();
        console.log('🌐 Route optimization result:', result);
        
        if (result.success) {
            if (result.message) {
                showError(result.message + (result.debug ? ` (${JSON.stringify(result.debug)})` : ''));
                updateStatus('ready', result.message);
            } else {
                optimizedRoute = result;
                displayOptimizedRoute(result);
                updateStatus('ready', `Route optimized: ${result.summary?.deliveries || 0} stops`);
            }
        } else {
            throw new Error(result.error || 'Route optimization failed');
        }
        
    } catch (error) {
        console.error('❌ Error optimizing route:', error);
        updateStatus('error', 'Route optimization failed');
        showError('Failed to optimize route: ' + error.message);
    }
}

// Display optimized route
function displayOptimizedRoute(routeData) {
    const summary = document.getElementById('route-summary');
    const visualization = document.getElementById('route-visualization');
    const packingOrder = document.getElementById('packing-order');
    
    // Show route summary
    if (routeData.summary) {
        summary.querySelector('.summary-stats').innerHTML = `
            <div class="stat-item">
                <strong>Deliveries:</strong> ${routeData.summary.deliveries}
            </div>
            <div class="stat-item">
                <strong>Total Distance:</strong> ${routeData.summary.totalDistance} km
            </div>
            <div class="stat-item">
                <strong>Estimated Time:</strong> ${routeData.summary.totalTime} minutes
            </div>
        `;
        summary.style.display = 'block';
    }
    
    // Show route visualization (simplified)
    if (routeData.optimizedRoute && routeData.optimizedRoute.length > 0) {
        let routeHtml = '<div class="route-list"><h4>🗺️ Optimized Delivery Sequence</h4>';
        
        routeData.optimizedRoute.forEach((order, index) => {
            const customerName = order.customer?.name || 'Unknown Customer';
            const address = order.customer?.address;
            const addressText = address ? 
                `${address.address1 || ''} ${address.city || ''}`.trim() : 
                'No address';
            
            routeHtml += `
                <div class="route-stop">
                    <div class="stop-number">${index + 1}</div>
                    <div class="stop-details">
                        <strong>#${order.orderNumber}</strong> - ${customerName}
                        <div class="stop-address">${addressText}</div>
                    </div>
                </div>
            `;
        });
        
        routeHtml += '</div>';
        visualization.innerHTML = routeHtml;
    }
    
    // Show packing order (reverse sequence)
    if (routeData.packingOrder && routeData.packingOrder.length > 0) {
        let packingHtml = '<div class="packing-list">';
        
        routeData.packingOrder.forEach((order, index) => {
            const customerName = order.customer?.name || 'Unknown Customer';
            const isLoaded = loadedOrders[order.id];
            
            packingHtml += `
                <div class="packing-item ${isLoaded ? 'loaded' : ''}">
                    <div class="pack-order">${index + 1}</div>
                    <div class="pack-details">
                        <strong>#${order.orderNumber}</strong> - ${customerName}
                        <div class="pack-items">${order.subscriptionItems || 'Order items'}</div>
                    </div>
                    <div class="pack-status">
                        ${isLoaded ? '✅ Loaded' : '📦 Load Next'}
                    </div>
                </div>
            `;
        });
        
        packingHtml += '</div>';
        packingOrder.querySelector('.packing-list').innerHTML = packingHtml;
        packingOrder.style.display = 'block';
    }
}

// Reset route optimization
function resetRoute() {
    optimizedRoute = null;
    
    document.getElementById('route-summary').style.display = 'none';
    document.getElementById('packing-order').style.display = 'none';
    
    document.getElementById('route-visualization').innerHTML = `
        <div class="route-placeholder">
            <h3>📍 Route Visualization</h3>
            <p>Load orders and click "Optimize Route" to see the optimized delivery sequence</p>
        </div>
    `;
    
    updateStatus('ready', 'Route reset');
}

// Export functions
function exportLoadingList() {
    if (allOrders.length === 0) {
        showError('No orders loaded to export');
        return;
    }
    
    let csv = 'Order Number,Customer Name,Section,Items,Status\n';
    
    allOrders.forEach(order => {
        const customerName = (order.customer?.name || 'Unknown').replace(/,/g, ';');
        const items = (order.subscriptionItems || 'Order items').replace(/,/g, ';');
        const section = order.section === 'freezer' ? 'Freezer' : 'Fridge';
        const status = loadedOrders[order.id] ? 'Loaded' : 'Not Loaded';
        
        csv += `${order.orderNumber},"${customerName}",${section},"${items}",${status}\n`;
    });
    
    downloadCsv(csv, `loading-list-${new Date().toISOString().split('T')[0]}.csv`);
}

function exportRouteSheet() {
    if (!optimizedRoute || optimizedRoute.optimizedRoute.length === 0) {
        showError('No optimized route to export. Please optimize route first.');
        return;
    }
    
    let csv = 'Stop Number,Order Number,Customer Name,Address,Items,Phone\n';
    
    optimizedRoute.optimizedRoute.forEach((order, index) => {
        const customerName = (order.customer?.name || 'Unknown').replace(/,/g, ';');
        const items = (order.subscriptionItems || 'Order items').replace(/,/g, ';');
        const phone = order.customer?.phone || '';
        const address = order.customer?.address;
        const addressText = address ? 
            `${address.address1 || ''} ${address.city || ''}`.trim().replace(/,/g, ';') : 
            'No address';
        
        csv += `${index + 1},${order.orderNumber},"${customerName}","${addressText}","${items}",${phone}\n`;
    });
    
    downloadCsv(csv, `route-sheet-${new Date().toISOString().split('T')[0]}.csv`);
}

// Utility functions
function showTab(tabName, event) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked tab
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Show corresponding tab content
    document.getElementById(tabName + '-tab').classList.add('active');
}

function updateStatus(status, message) {
    const statusElement = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    
    statusElement.className = `status-indicator ${status}`;
    statusText.textContent = message;
}

function showError(message) {
    alert('Error: ' + message);
}

function closeModal() {
    document.getElementById('order-modal').style.display = 'none';
}

function downloadCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Logout functionality
async function handleLogout() {
    try {
        const response = await fetch('/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            window.location.href = '/login';
        } else {
            showError('Logout failed. Please try again.');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showError('Logout failed. Please try again.');
    }
}