// Global state
let currentOrders = [];
let selectedOrders = [];
let conversations = [];
let selectedCustomer = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 JavaScript loaded and DOM ready');
    
    updateStatus('connected', 'System Ready');
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data
    loadConversations();
    
    // Update character count for message template
    updateCharCount();
});

function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // Tab buttons
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', function(e) {
            const tabName = this.getAttribute('data-tab');
            console.log('Tab clicked:', tabName);
            showTab(tabName, e);
        });
    });
    
    // Load Orders button
    const loadOrdersBtn = document.getElementById('load-orders-btn');
    if (loadOrdersBtn) {
        loadOrdersBtn.addEventListener('click', loadOrders);
    }
    
    // Load Conversations button
    const loadConversationsBtn = document.getElementById('load-conversations-btn');
    if (loadConversationsBtn) {
        loadConversationsBtn.addEventListener('click', loadConversations);
    }
    
    // Send Test SMS button
    const sendTestBtn = document.getElementById('send-test-sms-btn');
    if (sendTestBtn) {
        sendTestBtn.addEventListener('click', sendTestSMS);
    }
    
    // Send Reply button
    const sendReplyBtn = document.getElementById('send-reply-btn');
    if (sendReplyBtn) {
        sendReplyBtn.addEventListener('click', sendReply);
    }
    
    // Bulk SMS buttons
    const bulkTestBtn = document.getElementById('bulk-test-btn');
    if (bulkTestBtn) {
        bulkTestBtn.addEventListener('click', () => sendBulkSMS(true));
    }
    
    const bulkSendBtn = document.getElementById('bulk-send-btn');
    if (bulkSendBtn) {
        bulkSendBtn.addEventListener('click', () => sendBulkSMS(false));
    }
    
    // Close modal button
    const closeModalBtn = document.getElementById('close-modal-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }
    
    // Update Previews button
    const updatePreviewsBtn = document.getElementById('update-previews-btn');
    if (updatePreviewsBtn) {
        updatePreviewsBtn.addEventListener('click', updateMessagePreviews);
    }
    
    // Select All button
    const selectAllBtn = document.getElementById('select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', selectAllOrders);
    }
    
    // Select None button  
    const selectNoneBtn = document.getElementById('select-none-btn');
    if (selectNoneBtn) {
        selectNoneBtn.addEventListener('click', selectNoneOrders);
    }
    
    // Message template character counter
    const messageTemplate = document.getElementById('message-template');
    if (messageTemplate) {
        messageTemplate.addEventListener('input', updateCharCount);
    }
    
    // Reply message enter key
    const replyMessage = document.getElementById('reply-message');
    if (replyMessage) {
        replyMessage.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendReply();
            }
        });
    }
    
    // Template character counting
    const templateIds = ['home-delivery-default', 'pickup-default', 'pickup-ready', 'tag-templates'];
    templateIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', function() {
                updateCharCount(id);
            });
            // Initialize character count
            updateCharCount(id);
        }
    });
    
    console.log('✅ Event listeners set up complete');
}

// Tab Management
function showTab(tabName, event) {
    console.log('🔄 showTab called with:', tabName);
    
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked tab
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback - find tab by index
        const tabs = document.querySelectorAll('.tab');
        const tabNames = ['orders', 'conversations', 'test'];
        const tabIndex = tabNames.indexOf(tabName);
        if (tabIndex >= 0 && tabs[tabIndex]) {
            tabs[tabIndex].classList.add('active');
        }
    }
    
    // Show corresponding tab content
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // Load data when switching to conversations
    if (tabName === 'conversations') {
        loadConversations();
    }
};

// Status Management
function updateStatus(status, message) {
    const statusElement = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    
    statusElement.className = `status-indicator ${status}`;
    statusText.textContent = message;
}

// Character Counter
function updateCharCount() {
    const messageTemplate = document.getElementById('message-template');
    const charCount = document.getElementById('char-count');
    
    if (messageTemplate && charCount) {
        const length = messageTemplate.value.length;
        charCount.textContent = length;
        charCount.parentElement.classList.toggle('over-limit', length > 160);
    }
}

// Orders Management
window.loadOrders = async function loadOrders() {
    try {
        updateStatus('connecting', 'Loading orders...');
        
        const status = document.getElementById('order-status').value;
        const days = document.getElementById('days').value;
        const tag = document.getElementById('tag').value;
        
        const params = new URLSearchParams({
            status: status,
            days: days,
            limit: 100
        });
        
        if (tag) {
            params.append('tag', tag);
        }
        
        const response = await fetch(`/api/sms/orders?${params}`);
        const data = await response.json();
        
        if (data.success) {
            currentOrders = data.orders;
            displayOrders(currentOrders);
            updateStatus('connected', `${currentOrders.length} orders loaded`);
        } else {
            throw new Error(data.error || 'Failed to load orders');
        }
        
    } catch (error) {
        console.error('Error loading orders:', error);
        updateStatus('error', 'Failed to load orders');
        showError('Failed to load orders: ' + error.message);
    }
}

function displayOrders(orders) {
    const container = document.getElementById('orders-list');
    
    if (orders.length === 0) {
        container.innerHTML = '<div class="loading">No orders found with the selected filters</div>';
        return;
    }
    
    // Sort orders by delivery method first, then by tags
    const sortedOrders = [...orders].sort((a, b) => {
        const aDelivery = determineDeliveryMethod(a);
        const bDelivery = determineDeliveryMethod(b);
        const aTags = (a.tags || []).join(',').toLowerCase();
        const bTags = (b.tags || []).join(',').toLowerCase();
        
        // Pickup orders first, then delivery
        if (aDelivery === 'Pickup' && bDelivery === 'Home Delivery') return -1;
        if (aDelivery === 'Home Delivery' && bDelivery === 'Pickup') return 1;
        
        // Then sort by tag priority (urgent > ready > others)
        const urgentPriority = (tags) => {
            if (tags.includes('urgent')) return 0;
            if (tags.includes('ready')) return 1;
            if (tags.includes('first_order')) return 2;
            return 3;
        };
        
        const aPriority = urgentPriority(aTags);
        const bPriority = urgentPriority(bTags);
        
        return aPriority - bPriority;
    });
    
    let html = `
        <table class="orders-table">
            <thead>
                <tr>
                    <th class="checkbox-column">Send</th>
                    <th>Customer</th>
                    <th>Order #</th>
                    <th>Delivery Method</th>
                    <th>Tags</th>
                    <th>Message Preview</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sortedOrders.forEach((order, index) => {
        const customerName = order.customer?.name || 
            `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() ||
            'Unknown Customer';
        
        const phone = order.customer?.phone || order.billing_address?.phone || order.shipping_address?.phone || '';
        const hasPhone = !!phone;
        const deliveryMethod = determineDeliveryMethod(order);
        const tags = order.tags || [];
        const orderNumber = order.orderNumber || order.name || order.order_number || 'N/A';
        
        // Get personalized message template
        const messageTemplate = getMessageTemplate(deliveryMethod, tags, order);
        const personalizedMessage = personalizeMessage(messageTemplate, order);
        
        html += `
            <tr class="order-row ${!hasPhone ? 'order-disabled' : ''}">
                <td class="checkbox-column">
                    <input type="checkbox" class="order-checkbox" data-index="${index}" 
                           ${!hasPhone ? 'disabled' : ''}>
                </td>
                <td>
                    <div class="customer-name">${customerName}</div>
                    <div class="customer-phone ${!hasPhone ? 'no-phone' : ''}">${phone || 'No phone number'}</div>
                </td>
                <td class="order-number">#${orderNumber}</td>
                <td class="delivery-method">
                    <span class="delivery-badge ${deliveryMethod.toLowerCase().replace(' ', '-')}">${deliveryMethod}</span>
                </td>
                <td class="order-tags">
                    ${tags.map(tag => `<span class="tag-badge">${tag.trim()}</span>`).join('')}
                </td>
                <td class="message-column">
                    <textarea class="message-box" id="message-${index}" data-index="${index}">${personalizedMessage}</textarea>
                    <div class="char-counter" id="message-${index}-counter">0 chars</div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Add event listeners to checkboxes
    container.querySelectorAll('.order-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', function() {
            const index = parseInt(this.getAttribute('data-index'));
            toggleOrderSelection(index);
        });
    });
    
    // Add event listeners to message boxes for character counting
    container.querySelectorAll('.message-box').forEach((messageBox) => {
        messageBox.addEventListener('input', function() {
            const index = this.getAttribute('data-index');
            updateCharCount(`message-${index}`);
        });
        
        // Initialize character count
        const index = messageBox.getAttribute('data-index');
        updateCharCount(`message-${index}`);
    });
    
    // Update current orders reference to sorted orders
    currentOrders = sortedOrders;
}

function toggleOrderSelection(index) {
    const checkbox = document.querySelector(`[data-index="${index}"] input`);
    const orderItem = document.querySelector(`[data-index="${index}"]`);
    
    if (checkbox.checked) {
        selectedOrders.push(currentOrders[index]);
        orderItem.classList.add('selected');
    } else {
        selectedOrders = selectedOrders.filter(order => order.id !== currentOrders[index].id);
        orderItem.classList.remove('selected');
    }
    
    updateBulkActions();
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCount = document.getElementById('selected-count');
    
    if (selectedOrders.length > 0) {
        bulkActions.style.display = 'flex';
        selectedCount.textContent = selectedOrders.length;
    } else {
        bulkActions.style.display = 'none';
    }
}

window.sendBulkSMS = async function sendBulkSMS(testMode = false) {
    try {
        const messageTemplate = document.getElementById('message-template').value;
        
        if (!messageTemplate.trim()) {
            showError('Please enter a message template');
            return;
        }
        
        if (selectedOrders.length === 0) {
            showError('Please select at least one order');
            return;
        }
        
        updateStatus('connecting', `${testMode ? 'Testing' : 'Sending'} bulk SMS...`);
        
        const response = await fetch('/api/sms/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                orders: selectedOrders,
                message: messageTemplate,
                testMode: testMode
            })
        });
        
        const data = await response.json();
        
        if (data.success || data.totalSent !== undefined) {
            const results = data;
            updateStatus('connected', `${testMode ? 'Test completed' : 'Bulk SMS sent'}`);
            showBulkResults(results, testMode);
        } else {
            throw new Error(data.error || 'Failed to send bulk SMS');
        }
        
    } catch (error) {
        console.error('Error sending bulk SMS:', error);
        updateStatus('error', 'Failed to send SMS');
        showError('Failed to send bulk SMS: ' + error.message);
    }
}

// Conversations Management
window.loadConversations = async function loadConversations() {
    try {
        updateStatus('connecting', 'Loading conversations...');
        
        const response = await fetch('/api/sms/conversations?limit=50');
        const data = await response.json();
        
        if (data.success) {
            conversations = data.conversations;
            displayConversations(conversations);
            updateStatus('connected', `${conversations.length} conversations loaded`);
        } else {
            throw new Error(data.error || 'Failed to load conversations');
        }
        
    } catch (error) {
        console.error('Error loading conversations:', error);
        updateStatus('error', 'Failed to load conversations');
        showError('Failed to load conversations: ' + error.message);
    }
}

function displayConversations(conversations) {
    const container = document.getElementById('customer-list');
    
    if (conversations.length === 0) {
        container.innerHTML = '<div class="loading">No conversations found</div>';
        return;
    }
    
    container.innerHTML = conversations.map((customer, index) => {
        const latestMessage = customer.latestMessage;
        const messagePreview = latestMessage ? 
            (latestMessage.content && latestMessage.content.length > 50 ? 
                latestMessage.content.substring(0, 50) + '...' : 
                latestMessage.content || 'No content') : 
            'No messages';
        
        const timestamp = latestMessage && latestMessage.timestamp ? 
            formatTimestamp(latestMessage.timestamp) : '';
        
        const unreadCount = customer.unreadCount || 0;
        const hasUnread = unreadCount > 0;
        const unreadClass = hasUnread ? 'customer-item-unread' : '';
        const unreadBadge = hasUnread ? `<span class="unread-badge">${unreadCount}</span>` : '';
        
        return `
            <div class="customer-item ${unreadClass}" data-customer-id="${customer.customerId}" data-index="${index}">
                <div class="message-timestamp">${timestamp}${unreadBadge}</div>
                <div class="customer-name ${hasUnread ? 'customer-name-unread' : ''}">${customer.profile.name || 'Unknown Customer'}</div>
                <div class="customer-phone">${customer.profile.phone || 'No phone'}</div>
                <div class="message-preview ${hasUnread ? 'message-preview-unread' : ''}">${escapeHtml(messagePreview)}</div>
            </div>
        `;
    }).join('');
    
    // Add event listeners to customer items
    container.querySelectorAll('.customer-item').forEach((item) => {
        item.addEventListener('click', function() {
            const customerId = this.getAttribute('data-customer-id');
            const index = parseInt(this.getAttribute('data-index'));
            selectCustomer(customerId, index);
        });
    });
}

function selectCustomer(customerId, index) {
    // Remove previous selection
    document.querySelectorAll('.customer-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Find and select the clicked item
    const customerItems = document.querySelectorAll('.customer-item');
    if (customerItems[index]) {
        customerItems[index].classList.add('selected');
    }
    
    selectedCustomer = conversations[index];
    displayConversation(selectedCustomer);
    
    // Mark conversation as read if it has unread messages
    if (selectedCustomer.unreadCount > 0) {
        markConversationAsRead(customerId);
    }
    
    // Show quick reply
    document.getElementById('quick-reply').style.display = 'block';
}

// Function to mark conversation as read
async function markConversationAsRead(customerId) {
    try {
        const response = await fetch(`/api/sms/mark-read/${customerId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update the conversation in memory to reflect read status
            const customerIndex = conversations.findIndex(c => c.customerId === customerId);
            if (customerIndex >= 0) {
                conversations[customerIndex].unreadCount = 0;
                
                // Update visual indicators
                const customerItem = document.querySelector(`[data-customer-id="${customerId}"]`);
                if (customerItem) {
                    customerItem.classList.remove('customer-item-unread');
                    customerItem.querySelector('.customer-name').classList.remove('customer-name-unread');
                    customerItem.querySelector('.message-preview').classList.remove('message-preview-unread');
                    const unreadBadge = customerItem.querySelector('.unread-badge');
                    if (unreadBadge) {
                        unreadBadge.remove();
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error marking conversation as read:', error);
    }
}

function displayConversation(customerData) {
    const container = document.getElementById('conversation-content');
    const header = document.getElementById('conversation-header');
    const customerName = document.getElementById('selected-customer-name');
    const customerPhone = document.getElementById('selected-customer-phone');
    
    // Update header
    header.style.display = 'block';
    customerName.textContent = customerData.profile.name;
    customerPhone.textContent = customerData.profile.phone || 'No phone number';
    
    const messages = customerData.conversations || [];
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No Messages</h3>
                <p>Start a conversation with ${customerData.profile.name}</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="messages-container">';
    messages.forEach(message => {
        const isInbound = message.direction === 'inbound';
        const bubbleClass = isInbound ? 'message-inbound' : 'message-outbound';
        const timestamp = formatTimestamp(message.timestamp);
        
        html += `
            <div class="message-bubble ${bubbleClass}">
                <div class="message-content">${escapeHtml(message.content)}</div>
                <div class="message-time">${timestamp}</div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

window.sendReply = async function sendReply() {
    try {
        const replyMessage = document.getElementById('reply-message');
        const message = replyMessage.value.trim();
        
        if (!message) {
            showError('Please enter a message');
            return;
        }
        
        if (!selectedCustomer) {
            showError('Please select a customer');
            return;
        }
        
        updateStatus('connecting', 'Sending reply...');
        
        const response = await fetch('/api/sms/reply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                customerId: selectedCustomer.customerId,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            replyMessage.value = '';
            updateStatus('connected', 'Reply sent');
            
            // Add the sent message to the conversation display
            addMessageToConversation(message, 'outbound');
            
            // Refresh conversations to update latest message
            setTimeout(loadConversations, 1000);
        } else {
            throw new Error(data.error || 'Failed to send reply');
        }
        
    } catch (error) {
        console.error('Error sending reply:', error);
        updateStatus('error', 'Failed to send reply');
        showError('Failed to send reply: ' + error.message);
    }
}

function addMessageToConversation(content, direction) {
    const container = document.getElementById('conversation-content');
    const isInbound = direction === 'inbound';
    const bubbleClass = isInbound ? 'message-inbound' : 'message-outbound';
    const timestamp = formatTimestamp(new Date());
    
    const messageHtml = `
        <div class="message-bubble ${bubbleClass}">
            <div class="message-content">${escapeHtml(content)}</div>
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    
    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        container.innerHTML = '<div class="messages-container"></div>';
    }
    
    const messagesContainer = container.querySelector('.messages-container');
    if (messagesContainer) {
        messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
        container.scrollTop = container.scrollHeight;
    }
}

// Test SMS
window.sendTestSMS = async function sendTestSMS() {
    try {
        const phoneInput = document.getElementById('test-phone');
        const messageInput = document.getElementById('test-message');
        const resultsDiv = document.getElementById('test-results');
        
        const phone = phoneInput.value.trim();
        const message = messageInput.value.trim();
        
        if (!phone || !message) {
            showError('Please enter both phone number and message');
            return;
        }
        
        updateStatus('connecting', 'Sending test SMS...');
        
        const response = await fetch('/api/sms/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone: phone,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStatus('connected', 'Test SMS sent successfully');
            resultsDiv.className = 'results success';
            resultsDiv.innerHTML = `
                <h4>✅ Test SMS Sent Successfully!</h4>
                <p><strong>Phone:</strong> ${data.phone}</p>
                <p><strong>Message:</strong> ${data.message}</p>
                <p><strong>Sent at:</strong> ${formatTimestamp(new Date(data.timestamp))}</p>
            `;
        } else {
            throw new Error(data.error || 'Failed to send test SMS');
        }
        
        resultsDiv.style.display = 'block';
        
    } catch (error) {
        const resultsDiv = document.getElementById('test-results');
        console.error('Error sending test SMS:', error);
        updateStatus('error', 'Failed to send test SMS');
        
        resultsDiv.className = 'results error';
        resultsDiv.innerHTML = `
            <h4>❌ Test SMS Failed</h4>
            <p>${error.message}</p>
        `;
        resultsDiv.style.display = 'block';
    }
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function formatTimestamp(date) {
    // Handle different date formats
    let parsedDate;
    if (date instanceof Date && !isNaN(date)) {
        parsedDate = date;
    } else if (typeof date === 'string' || typeof date === 'number') {
        parsedDate = new Date(date);
    } else {
        return 'Invalid Date';
    }
    
    // Check if date is valid
    if (isNaN(parsedDate.getTime())) {
        return 'Invalid Date';
    }
    
    const now = new Date();
    const diff = now - parsedDate;
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
        return parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (hours < 48) {
        return 'Yesterday ' + parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return parsedDate.toLocaleDateString() + ' ' + parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    alert('Error: ' + message); // Simple error handling - could be improved with better UI
}

function showBulkResults(results, testMode) {
    const modal = document.getElementById('results-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    modalTitle.textContent = testMode ? 'Test Results' : 'Bulk SMS Results';
    
    let html = `
        <div class="results-summary">
            <h4>${testMode ? '🧪 Test Mode Results' : '📤 Bulk SMS Results'}</h4>
            <p><strong>Total Processed:</strong> ${results.totalSent + results.totalErrors}</p>
            <p><strong>Successful:</strong> ${results.totalSent}</p>
            <p><strong>Errors:</strong> ${results.totalErrors}</p>
        </div>
    `;
    
    if (results.success && results.success.length > 0) {
        html += `
            <div class="success-section">
                <h5>✅ Successful ${testMode ? 'Tests' : 'Sends'}</h5>
                <ul>
        `;
        
        results.success.forEach(item => {
            html += `
                <li>
                    <strong>${item.customerName}</strong> (${item.phone})
                    <br><em>Order #${item.orderNumber}</em>
                    ${testMode ? '<br><span style="color: #059669;">✓ Test passed</span>' : ''}
                </li>
            `;
        });
        
        html += '</ul></div>';
    }
    
    if (results.errors && results.errors.length > 0) {
        html += `
            <div class="error-section">
                <h5>❌ Errors</h5>
                <ul>
        `;
        
        results.errors.forEach(item => {
            html += `
                <li>
                    <strong>${item.customerName || 'Unknown'}</strong> 
                    ${item.phone ? `(${item.phone})` : ''}
                    <br><em>Order #${item.orderNumber}</em>
                    <br><span style="color: #dc2626;">${item.error}</span>
                </li>
            `;
        });
        
        html += '</ul></div>';
    }
    
    modalBody.innerHTML = html;
    modal.style.display = 'flex';
}

window.closeModal = function closeModal() {
    document.getElementById('results-modal').style.display = 'none';
}

// Close modal when clicking outside
document.getElementById('results-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// Template Management Functions
function parseTagTemplates() {
    const tagTemplatesText = document.getElementById('tag-templates').value;
    const templates = {};
    
    tagTemplatesText.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && trimmed.includes('=')) {
            const [tag, message] = trimmed.split('=', 2);
            templates[tag.trim().toLowerCase()] = message.trim();
        }
    });
    
    return templates;
}

function determineDeliveryMethod(order) {
    // Check shipping method title
    if (order.shipping_lines && order.shipping_lines.length > 0) {
        const shippingTitle = order.shipping_lines[0].title.toLowerCase();
        if (shippingTitle.includes('pickup') || shippingTitle.includes('collection')) {
            return 'Pickup';
        }
        if (shippingTitle.includes('delivery') || shippingTitle.includes('shipping')) {
            return 'Home Delivery';
        }
    }
    
    // Check if there's a shipping address
    if (order.shipping_address) {
        return 'Home Delivery';
    }
    
    // Default fallback
    return 'Pickup';
}

function getMessageTemplate(deliveryMethod, tags, order) {
    const tagTemplates = parseTagTemplates();
    
    // Check for tag-specific templates first
    for (const tag of tags) {
        const lowerTag = tag.toLowerCase();
        if (tagTemplates[lowerTag]) {
            return tagTemplates[lowerTag];
        }
    }
    
    // Fall back to delivery method templates
    const isPickup = deliveryMethod === 'Pickup';
    const hasReadyTag = tags.some(tag => tag.toLowerCase().includes('ready') || tag.toLowerCase().includes('completed'));
    
    if (isPickup) {
        if (hasReadyTag) {
            const pickupReadyTemplate = document.getElementById('pickup-ready');
            return pickupReadyTemplate ? pickupReadyTemplate.value : 'Hi {customerName}, your order is ready for pickup!';
        }
        const pickupDefaultTemplate = document.getElementById('pickup-default');
        return pickupDefaultTemplate ? pickupDefaultTemplate.value : 'Hi {customerName}, your order will be ready soon for pickup!';
    } else {
        const deliveryDefaultTemplate = document.getElementById('home-delivery-default');
        return deliveryDefaultTemplate ? deliveryDefaultTemplate.value : 'Hi {customerName}, thanks for your order! We\'ll be in touch with delivery details.';
    }
}

function personalizeMessage(template, order) {
    const customerName = order.customer?.name || order.customer?.first_name || 'there';
    const orderNumber = order.orderNumber || order.name || order.order_number;
    const deliveryMethod = determineDeliveryMethod(order);
    const totalPrice = order.totalPrice || order.total_price || '';
    const orderItems = order.subscriptionItems || 'order';
    
    return template
        .replace(/\{customerName\}/g, customerName)
        .replace(/\{orderNumber\}/g, orderNumber)
        .replace(/\{deliveryMethod\}/g, deliveryMethod)
        .replace(/\{totalPrice\}/g, totalPrice)
        .replace(/\{orderItems\}/g, orderItems);
}

function updateMessagePreviews() {
    if (currentOrders.length === 0) {
        showError('Please load orders first');
        return;
    }
    
    const container = document.getElementById('orders-list');
    const messageBoxes = container.querySelectorAll('.message-box');
    
    messageBoxes.forEach((messageBox, index) => {
        if (currentOrders[index]) {
            const order = currentOrders[index];
            const deliveryMethod = determineDeliveryMethod(order);
            const tags = order.tags || [];
            const messageTemplate = getMessageTemplate(deliveryMethod, tags, order);
            const personalizedMessage = personalizeMessage(messageTemplate, order);
            
            messageBox.value = personalizedMessage;
            updateCharCount(`message-${index}`);
        }
    });
    
    updateStatus('connected', 'Message previews updated');
}

function selectAllOrders() {
    const checkboxes = document.querySelectorAll('.order-checkbox:not(:disabled)');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
        const index = parseInt(checkbox.getAttribute('data-index'));
        if (index >= 0 && !selectedOrders.find(order => order.id === currentOrders[index].id)) {
            selectedOrders.push(currentOrders[index]);
        }
    });
    updateBulkActions();
}

function selectNoneOrders() {
    const checkboxes = document.querySelectorAll('.order-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    selectedOrders = [];
    updateBulkActions();
}

function updateCharCount(textareaId) {
    const textarea = document.getElementById(textareaId);
    const counter = document.getElementById(textareaId + '-counter');
    
    if (!textarea || !counter) return;
    
    const text = textarea.value;
    const length = text.length;
    
    // Calculate SMS segments
    let segments = 1;
    let maxChars = 160;
    
    // Check if text contains non-GSM characters (emojis, unicode)
    const hasUnicode = /[^\x00-\x7F]/.test(text);
    if (hasUnicode) {
        maxChars = 70;
    }
    
    if (length > maxChars) {
        segments = Math.ceil(length / (maxChars - 7)); // -7 for concatenation header
    }
    
    // Update counter text
    let counterText = `${length} chars`;
    if (segments > 1) {
        counterText += ` (${segments} SMS)`;
    }
    
    counter.textContent = counterText;
    
    // Update color based on length
    counter.className = 'char-counter';
    if (length <= 140) {
        // Safe range - green
    } else if (length <= 160) {
        counter.classList.add('warning');
    } else {
        counter.classList.add('danger');
    }
}