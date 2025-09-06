// QuoteIQ Webhook Handler - Complete Version with JSON Authentication
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
    const eventType = eventData.type; // QuoteIQ uses 'type' field
    const payload = eventData.payload;
    
    // Handle different types of events
    switch(eventType) {
      case 'estimate.created':
        handleEstimateCreated(payload);
        break;
      case 'estimate.updated':
        handleEstimateUpdated(payload);
        break;
      case 'estimate.deleted':
        handleEstimateDeleted(payload);
        break;
      case 'schedule.created':
        handleScheduleCreated(payload);
        break;
      case 'schedule.updated':
        handleScheduleUpdated(payload);
        break;
      case 'schedule.deleted':
        handleScheduleDeleted(payload);
        break;
      default:
        console.log('Unknown event type:', eventType);
    }

    // Always respond with 200 OK to acknowledge receipt
    res.status(200).json({ 
      success: true, 
      message: 'Event received successfully',
      event_type: eventType,
      doc_id: payload.doc_id 
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Event handlers for QuoteIQ events
function handleEstimateCreated(payload) {
  console.log('New estimate created:', {
    estimate_no: payload.estimate_no,
    customer: payload.customer_name,
    total: payload.total
  });
  
  const customerPhone = payload.customer_phone;
  const customerName = payload.customer_name;
  const estimateNo = payload.estimate_no;
  
  if (customerPhone) {
    // Send welcome SMS when estimate is created
    const message = `Hi ${customerName}! Thanks for requesting estimate #${estimateNo}. We'll prepare your quote and get back to you soon.`;
    sendSMS(customerPhone, message, 'estimate_created');
  }
}

function handleEstimateUpdated(payload) {
  console.log('Estimate updated:', {
    estimate_no: payload.estimate_no,
    total: payload.total,
    pdf_status: payload.estimate_pdf_generation_status,
    estimate_status: payload.estimate_status
  });
  
  const customerPhone = payload.customer_phone;
  const customerName = payload.customer_name;
  const estimateNo = payload.estimate_no;
  const pdfUrl = payload.estimate_pdf_url;
  const pdfStatus = payload.estimate_pdf_generation_status;
  const estimateStatus = payload.estimate_status;
  
  if (customerPhone) {
    // Send SMS when PDF is ready
    if (pdfUrl && pdfStatus === 'succeeded') {
      const message = `Hi ${customerName}! Your quote #${estimateNo} is ready! View it here: ${pdfUrl}`;
      sendSMS(customerPhone, message, 'quote_ready');
    }
    // Send SMS when estimate status changes (e.g., approved, sent)
    else if (estimateStatus === 1) {
      const message = `Hi ${customerName}! We've sent your quote #${estimateNo}. Please review it and let us know if you have any questions.`;
      sendSMS(customerPhone, message, 'quote_sent');
    }
    // Send SMS when services are added and total > 0
    else if (payload.total > 0 && payload.service_list && payload.service_list.length > 0) {
      const message = `Your estimate #${estimateNo} has been updated with services totaling $${payload.total}. We'll have your full quote ready shortly!`;
      sendSMS(customerPhone, message, 'estimate_updated');
    }
  }
}

function handleEstimateDeleted(payload) {
  console.log('Estimate deleted:', {
    estimate_no: payload.estimate_no,
    customer: payload.customer_name
  });
  
  const customerPhone = payload.customer_phone;
  const customerName = payload.customer_name;
  const estimateNo = payload.estimate_no;
  
  if (customerPhone) {
    // Optional: Send SMS when estimate is deleted (might not always be desired)
    const message = `Hi ${customerName}! Estimate #${estimateNo} has been cancelled. If you'd like to request a new quote, please contact us.`;
    sendSMS(customerPhone, message, 'estimate_cancelled');
  }
}

function handleScheduleCreated(payload) {
  console.log('Schedule created:', {
    customer: payload.customer_name,
    start_time: new Date(payload.schedule_starts_at),
    notes: payload.schedule_notes
  });
  
  const customerPhone = payload.customer_phone;
  const customerName = payload.customer_name;
  
  // Create Google Calendar event
  if (payload.schedule_starts_at && payload.schedule_ends_at) {
    const calendarEvent = {
      summary: `Appointment - ${customerName || 'QuoteIQ Customer'}`,
      description: `
        Customer: ${customerName || 'N/A'}
        Phone: ${customerPhone || 'N/A'}
        Email: ${payload.customer_email || 'N/A'}
        Address: ${payload.customer_address || 'N/A'}
        Services: ${payload.services_list || 'N/A'}
        Notes: ${payload.schedule_notes || 'None'}
        QuoteIQ Doc ID: ${payload.doc_id}
      `.trim(),
      start: {
        dateTime: new Date(payload.schedule_starts_at).toISOString()
      },
      end: {
        dateTime: new Date(payload.schedule_ends_at).toISOString()
      },
      attendees: payload.customer_email ? [{ email: payload.customer_email }] : [],
      location: payload.customer_address || ''
    };
    
    createGoogleCalendarEvent(calendarEvent, payload.doc_id);
  }
  
  // Send SMS if customer info is available
  if (customerPhone && customerName) {
    const startDate = new Date(payload.schedule_starts_at);
    const dateStr = startDate.toLocaleDateString();
    const timeStr = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const message = `Hi ${customerName}! Your appointment is confirmed for ${dateStr} at ${timeStr}. We'll see you then!`;
    sendSMS(customerPhone, message, 'appointment_confirmed');
  }
}

function handleScheduleUpdated(payload) {
  console.log('Schedule updated:', {
    customer: payload.customer_name,
    start_time: new Date(payload.schedule_starts_at),
    notes: payload.schedule_notes
  });
  
  const customerPhone = payload.customer_phone;
  const customerName = payload.customer_name;
  
  // Update Google Calendar event
  if (payload.schedule_starts_at && payload.schedule_ends_at) {
    const updatedCalendarEvent = {
      summary: `Appointment - ${customerName || 'QuoteIQ Customer'}`,
      description: `
        Customer: ${customerName || 'N/A'}
        Phone: ${customerPhone || 'N/A'}
        Email: ${payload.customer_email || 'N/A'}
        Address: ${payload.customer_address || 'N/A'}
        Services: ${payload.services_list || 'N/A'}
        Notes: ${payload.schedule_notes || 'None'}
        QuoteIQ Doc ID: ${payload.doc_id}
      `.trim(),
      start: {
        dateTime: new Date(payload.schedule_starts_at).toISOString()
      },
      end: {
        dateTime: new Date(payload.schedule_ends_at).toISOString()
      },
      attendees: payload.customer_email ? [{ email: payload.customer_email }] : [],
      location: payload.customer_address || ''
    };
    
    updateGoogleCalendarEvent(updatedCalendarEvent, payload.doc_id);
  }
  
  // Send SMS notification
  if (customerPhone && customerName) {
    const startDate = new Date(payload.schedule_starts_at);
    const dateStr = startDate.toLocaleDateString();
    const timeStr = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const message = `Hi ${customerName}! Your appointment has been rescheduled to ${dateStr} at ${timeStr}. Please let us know if this works for you.`;
    sendSMS(customerPhone, message, 'appointment_rescheduled');
  }
}

function handleScheduleDeleted(payload) {
  console.log('Schedule deleted:', {
    customer: payload.customer_name,
    doc_id: payload.doc_id
  });
  
  const customerPhone = payload.customer_phone;
  const customerName = payload.customer_name;
  
  // Delete Google Calendar event
  deleteGoogleCalendarEvent(payload.doc_id);
  
  // Send SMS if customer info is available
  if (customerPhone && customerName) {
    const message = `Hi ${customerName}! Your appointment has been cancelled. Please contact us to reschedule if needed.`;
    sendSMS(customerPhone, message, 'appointment_cancelled');
  }
}

// Twilio SMS function (commented out)
async function sendSMS(to, message, eventType) {
  try {
    console.log(`SMS disabled - would send for ${eventType}:`, {
      to: to,
      message: message.substring(0, 50) + '...',
      length: message.length
    });
    
    // Twilio SMS functionality commented out
    /*
    const formattedPhone = formatPhoneNumber(to);
    
    if (!isValidPhoneNumber(formattedPhone)) {
      console.log('Invalid phone number:', to);
      return;
    }
    
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });
    
    console.log('SMS sent successfully:', result.sid);
    return result;
    */
    
  } catch (error) {
    console.error('SMS error (disabled):', error);
  }
}

// Google Calendar Integration Functions
const { google } = require('googleapis');

// Store event mappings (in production, use a database)
const eventMappings = new Map(); // Maps QuoteIQ doc_id to Google Calendar event_id

async function getGoogleCalendarAuth() {
  try {
    console.log('Setting up Google Calendar authentication with JSON credentials...');
    
    // Check if we have the JSON credentials
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable not found');
      return null;
    }
    
    // Parse the JSON credentials
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    console.log('Parsed credentials for:', credentials.client_email);
    console.log('Project ID:', credentials.project_id);
    
    // Use service account authentication with parsed JSON
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });
    
    console.log('Google Auth configured successfully with JSON method');
    return google.calendar({ version: 'v3', auth });
  } catch (error) {
    console.error('Google Calendar auth error:', error.message);
    console.error('Full error:', error);
    return null;
  }
}

async function createGoogleCalendarEvent(eventData, quoteiqDocId) {
  try {
    console.log('Starting Google Calendar event creation...');
    const calendar = await getGoogleCalendarAuth();
    if (!calendar) {
      console.log('Google Calendar authentication failed - skipping event creation');
      return;
    }
    
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    console.log('Using calendar ID:', calendarId);
    
    console.log('Creating Google Calendar event:', eventData.summary);
    console.log('Event data:', JSON.stringify(eventData, null, 2));
    
    console.log('About to call calendar.events.insert...');
    
    // Set a timeout for the API call
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('API call timeout after 10 seconds')), 10000)
    );
    
    const insertPromise = calendar.events.insert({
      calendarId: calendarId,
      resource: eventData
    });
    
    console.log('Waiting for API response...');
    const response = await Promise.race([insertPromise, timeoutPromise]);
    
    // Store the mapping between QuoteIQ doc_id and Google Calendar event_id
    eventMappings.set(quoteiqDocId, response.data.id);
    
    console.log('SUCCESS: Google Calendar event created with ID:', response.data.id);
    console.log('Event URL:', response.data.htmlLink);
    return response.data;
    
  } catch (error) {
    console.error('DETAILED ERROR creating Google Calendar event:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error status:', error.status);
    console.error('Error name:', error.name);
    
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    
    if (error.message === 'API call timeout after 10 seconds') {
      console.error('The Google Calendar API call timed out - this suggests a network or permissions issue');
    }
    
    console.error('Full error object:', JSON.stringify(error, null, 2));
  }
}

async function updateGoogleCalendarEvent(eventData, quoteiqDocId) {
  try {
    const calendar = await getGoogleCalendarAuth();
    if (!calendar) {
      console.log('Google Calendar not configured - would update event:', eventData.summary);
      return;
    }
    
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const googleEventId = eventMappings.get(quoteiqDocId);
    
    if (!googleEventId) {
      console.log('No existing Google Calendar event found for doc_id:', quoteiqDocId);
      // Create new event instead
      return createGoogleCalendarEvent(eventData, quoteiqDocId);
    }
    
    console.log('Updating Google Calendar event:', googleEventId);
    
    const response = await calendar.events.update({
      calendarId: calendarId,
      eventId: googleEventId,
      resource: eventData
    });
    
    console.log('Google Calendar event updated:', response.data.id);
    return response.data;
    
  } catch (error) {
    console.error('Error updating Google Calendar event:', error);
    // If event not found, try creating a new one
    if (error.code === 404) {
      console.log('Event not found, creating new one');
      eventMappings.delete(quoteiqDocId);
      return createGoogleCalendarEvent(eventData, quoteiqDocId);
    }
  }
}

async function deleteGoogleCalendarEvent(quoteiqDocId) {
  try {
    const calendar = await getGoogleCalendarAuth();
    if (!calendar) {
      console.log('Google Calendar not configured - would delete event for doc_id:', quoteiqDocId);
      return;
    }
    
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const googleEventId = eventMappings.get(quoteiqDocId);
    
    if (!googleEventId) {
      console.log('No Google Calendar event found to delete for doc_id:', quoteiqDocId);
      return;
    }
    
    console.log('Deleting Google Calendar event:', googleEventId);
    
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: googleEventId
    });
    
    // Remove from our mapping
    eventMappings.delete(quoteiqDocId);
    
    console.log('Google Calendar event deleted:', googleEventId);
    
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error);
    // Remove from mapping even if delete failed
    eventMappings.delete(quoteiqDocId);
  }
}

// Helper function to format phone numbers
function formatPhoneNumber(phone) {
  // Remove any formatting and ensure it starts with +1
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  return phone; // Return as-is if can't format
}

// Helper function to check if phone number is valid
function isValidPhoneNumber(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`QuoteIQ webhook server running on port ${PORT}`);
  console.log('Features: Google Calendar integration, SMS notifications (disabled)');
  console.log('Supported events: estimate.created, estimate.updated, estimate.deleted, schedule.created, schedule.updated, schedule.deleted');
});

module.exports = app;
