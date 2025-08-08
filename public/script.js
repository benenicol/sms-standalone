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
    
    container.innerHTML = orders.map((order, index) => `
        <div class="order-item" data-index="${index}">
            <input type="checkbox" class="order-checkbox" data-index="${index}">
            <div class="order-info">
                <div>
                    <div class="customer-name">${order.customer.name}</div>
                    <div class="customer-phone">${order.customer.phone || 'No phone'}</div>
                </div>
                <div>
                    <div class="delivery-method">${order.deliveryMethod}</div>
                    <div class="order-number">Order #${order.orderNumber}</div>
                </div>
                <div>
                    <div>${order.totalPrice ? '$' + order.totalPrice : ''}</div>
                    <div class="order-number">${formatDate(order.createdAt)}</div>
                </div>
                <div>
                    ${order.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners to checkboxes
    container.querySelectorAll('.order-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', function() {
            const index = parseInt(this.getAttribute('data-index'));
            toggleOrderSelection(index);
        });
    });
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
        
        return `
            <div class="customer-item" data-customer-id="${customer.customerId}" data-index="${index}">
                <div class="message-timestamp">${timestamp}</div>
                <div class="customer-name">${customer.profile.name || 'Unknown Customer'}</div>
                <div class="customer-phone">${customer.profile.phone || 'No phone'}</div>
                <div class="message-preview">${escapeHtml(messagePreview)}</div>
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
    
    // Show quick reply
    document.getElementById('quick-reply').style.display = 'block';
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