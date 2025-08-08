# SMS Webhook - Standalone Google Apps Script

This is a dedicated SMS webhook handler for Twilio SMS replies, separate from the main BeefBoxAI3000 system to avoid deployment conflicts.

## Setup Instructions

### 1. Create New Google Apps Script Project

1. Go to https://script.google.com/
2. Click "New Project"
3. Give it a name: "SMS Webhook Handler"

### 2. Copy Code

Replace the default `Code.gs` with the contents of `SMS-Webhook.js`
Add `Config.js` as a new file

### 3. Set Up Service Account Key

1. Go to Project Settings (gear icon)
2. Go to "Script Properties"
3. Add property:
   - **Name:** `SERVICE_ACCOUNT_KEY`
   - **Value:** Your Firebase service account JSON (same as main project)

### 4. Deploy as Web App

1. Click "Deploy" → "New Deployment"
2. Choose "Web app"
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click "Deploy"
5. Copy the web app URL

### 5. Update Twilio Webhook

1. Go to Twilio Console
2. Phone Numbers → Manage → Active Numbers
3. Click your number (+61468001890)
4. Set webhook URL to the new Apps Script URL
5. Save

### 6. Test

1. Send SMS to +61468001890
2. Check execution logs in Apps Script
3. Check "SMS Webhook Logs" sheet in your spreadsheet
4. Verify message appears in Firestore

## Features

- **Clean SMS webhook handler** - No conflicts with Shopify webhooks
- **Firestore integration** - Stores messages in customer_communications collection
- **Shopify customer lookup** - Links phone numbers to Shopify customers when possible
- **Sheet logging** - Logs all webhook activity for debugging
- **Error handling** - Graceful error handling with TwiML responses

## Files

- `SMS-Webhook.js` - Main webhook handler
- `Config.js` - Configuration constants
- `appsscript.json` - Apps Script manifest
- `.clasp.json` - Clasp configuration (empty scriptId - fill after creating project)

## Debugging

- Check Apps Script execution logs for detailed error messages
- Check "SMS Webhook Logs" sheet for webhook activity
- Test with `testWebhookSetup()` function to verify connections