#!/bin/bash

echo "🔄 Restarting SMS Webhook Server..."

# Kill any existing node server processes for this project
pkill -f "node server.js" 2>/dev/null

# Wait a moment for processes to terminate
sleep 2

# Start the server in the background
echo "🚀 Starting server..."
node server.js &

# Get the process ID
SERVER_PID=$!

echo "✅ Server restarted successfully!"
echo "📱 Access at: http://localhost:3000"
echo "🆔 Process ID: $SERVER_PID"
echo ""
echo "To stop the server later, run: kill $SERVER_PID"
echo "Or use: pkill -f 'node server.js'"