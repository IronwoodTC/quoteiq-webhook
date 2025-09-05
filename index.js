// QuoteIQ Webhook Handler - Node.js/Express
const express = require('express');
const app = express();

// Middleware to parse JSON
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'QuoteIQ webhook receiver is running' });
});

// Main webhook endpoint
app.post('/webhook/quoteiq', (req, res) => {
  try {
    console.log('QuoteIQ Event Received:', {
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Extract event data
    const eventData = req.body;
    
    // Handle different types of events
    switch(eventData.event_type) {
      case 'quote_requested':
        handleQuoteRequested(eventData);
        break;
      case 'quote_updated':
        handleQuoteUpdated(eventData);
        break;
      case 'appointment_scheduled':
        handleAppointmentScheduled(eventData);
        break;
      case 'customer_created':
        handleCustomerCreated(eventData);
        break;
      default:
        console.log('Unknown event type:', eventData.event_type);
    }

    // Always respond with 200 OK to acknowledge receipt
    res.status(200).json({ 
      success: true, 
      message: 'Event received successfully',
      event_id: eventData.id 
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Event handlers
function handleQuoteRequested(data) {
  console.log('New quote requested:', data);
  
  // Example: Send SMS via Twilio
  // sendSMS(data.customer.phone, `Thanks for requesting a quote! We'll get back to you soon.`);
  
  // Example: Add to your CRM
  // addTocrm(data.customer);
}

function handleQuoteUpdated(data) {
  console.log('Quote updated:', data);
  
  // Example: Notify customer of quote update
  // sendSMS(data.customer.phone, `Your quote has been updated. Check your email for details.`);
}

function handleAppointmentScheduled(data) {
  console.log('Appointment scheduled:', data);
  
  // Example: Send appointment confirmation
  // sendSMS(data.customer.phone, `Appointment confirmed for ${data.appointment.date} at ${data.appointment.time}`);
}

function handleCustomerCreated(data) {
  console.log('New customer created:', data);
  
  // Example: Send welcome message
  // sendSMS(data.customer.phone, `Welcome! We're excited to work with you.`);
}

// Example Twilio SMS function (uncomment and configure)
/*
const twilio = require('twilio');
const client = twilio('your_account_sid', 'your_auth_token');

async function sendSMS(to, message) {
  try {
    const result = await client.messages.create({
      body: message,
      from: 'your_twilio_phone_number',
      to: to
    });
    console.log('SMS sent:', result.sid);
  } catch (error) {
    console.error('SMS error:', error);
  }
}
*/

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`QuoteIQ webhook server running on port ${PORT}`);
});

module.exports = app;