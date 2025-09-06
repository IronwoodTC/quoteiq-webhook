// QuoteIQ Webhook Handler - Complete Version with JSON Authentication
const express = require('express');
const { google } = require('googleapis');
const app = express();

// Middleware to parse JSON
app.use(express.json());

// Store event mappings (in a production environment, use a database)
const eventMappings = new Map(); // Maps QuoteIQ doc_id to Google Calendar event_id

// Google Calendar Integration Functions
async function getGoogleCalendarAuth() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });
    return google.calendar({ version: 'v3', auth });
  } catch (error) {
    console.error('Google Calendar auth error:', error.message);
    return null;
  }
}

async function createGoogleCalendarEvent(eventData, quoteiqDocId) {
  try {
    const calendar = await getGoogleCalendarAuth();
    if (!calendar) {
      console.log('Google Calendar authentication failed. Skipping event creation.');
      return;
    }

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    console.log('About to call calendar.events.insert...');
    
    const response = await calendar.events.insert({
      calendarId: calendarId,
      resource: eventData
    });
    
    eventMappings.set(quoteiqDocId, response.data.id);
    console.log('SUCCESS: Google Calendar event created with ID:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('Error creating Google Calendar event:', error.message);
    console.error('Full error object:', JSON.stringify(error.response ? error.response.data : error, null, 2));
    throw error;
  }
}

async function updateGoogleCalendarEvent(eventData, quoteiqDocId) {
  try {
    const calendar = await getGoogleCalendarAuth();
    if (!calendar) {
      console.log('Google Calendar not configured. Skipping event update.');
      return;
    }
    
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const googleEventId = eventMappings.get(quoteiqDocId);
    
    if (!googleEventId) {
      console.log('No existing Google Calendar event found. Creating a new one.');
      return await createGoogleCalendarEvent(eventData, quoteiqDocId);
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
    console.error('Error updating Google Calendar event:', error.message);
    if (error.code === 404) {
      console.log('Event not found. Creating a new one.');
      eventMappings.delete(quoteiqDocId);
      return await createGoogleCalendarEvent(eventData, quoteiqDocId);
    }
    throw error;
  }
}

async function deleteGoogleCalendarEvent(quoteiqDocId) {
  try {
    const calendar = await getGoogleCalendarAuth();
    if (!calendar) {
      console.log('Google Calendar not configured. Skipping event deletion.');
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
    
    eventMappings.delete(quoteiqDocId);
    console.log('Google Calendar event deleted successfully.');
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error.message);
    eventMappings.delete(quoteiqDocId);
    throw error;
  }
}

// Event handlers
async function handleScheduleCreated(payload) {
  console.log('Schedule created:', { customer: payload.customer_name });
  const calendarEvent = {
    summary: `Appointment - ${payload.customer_name || 'QuoteIQ Customer'}`,
    description: `
        Customer: ${payload.customer_name || 'N/A'}
        Phone: ${payload.customer_phone || 'N/A'}
        Email: ${payload.customer_email || 'N/A'}
        Address: ${payload.customer_address || 'N/A'}
        Services: ${payload.services_list || 'N/A'}
        Notes: ${payload.schedule_notes || 'None'}
        QuoteIQ Doc ID: ${payload.doc_id}
      `.trim(),
    start: {
      dateTime: new Date(payload.schedule_starts_at).toISOString(),
    },
    end: {
      dateTime: new Date(payload.schedule_ends_at).toISOString(),
    },
    location: payload.customer_address || '', 
    attendees: payload.customer_email ? [{ email: payload.customer_email }] : [],
  };

  await createGoogleCalendarEvent(calendarEvent, payload.doc_id);
}

async function handleScheduleUpdated(payload) {
  console.log('Schedule updated:', { customer: payload.customer_name });
  
  const updatedCalendarEvent = {
    summary: `Appointment - ${payload.customer_name || 'QuoteIQ Customer'}`,
    description: `
        Customer: ${payload.customer_name || 'N/A'}
        Phone: ${payload.customer_phone || 'N/A'}
        Email: ${payload.customer_email || 'N/A'}
        Address: ${payload.customer_address || 'N/A'}
        Services: ${payload.services_list || 'N/A'}
        Notes: ${payload.schedule_notes || 'None'}
        QuoteIQ Doc ID: ${payload.doc_id}
      `.trim(),
    start: {
      dateTime: new Date(payload.schedule_starts_at).toISOString(),
    },
    end: {
      dateTime: new Date(payload.schedule_ends_at).toISOString(),
    },
    location: payload.customer_address || '', 
    attendees: payload.customer_email ? [{ email: payload.customer_email }] : [],
  };

  await updateGoogleCalendarEvent(updatedCalendarEvent, payload.doc_id);
}

async function handleScheduleDeleted(payload) {
  console.log('Schedule deleted:', { doc_id: payload.doc_id });
  await deleteGoogleCalendarEvent(payload.doc_id);
}

// Main webhook endpoint
app.post('/webhook/quoteiq', async (req, res) => {
  try {
    const eventData = req.body;
    const eventType = eventData.type;
    const payload = eventData.payload;

    console.log(`Processing event: ${eventType}`);

    switch(eventType) {
      case 'schedule.created':
        await handleScheduleCreated(payload);
        break;
      case 'schedule.updated':
        await handleScheduleUpdated(payload);
        break;
      case 'schedule.deleted':
        await handleScheduleDeleted(payload);
        break;
      default:
        console.log('Event type not handled:', eventType);
    }

    res.status(200).json({ success: true, message: 'Event processed successfully' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'QuoteIQ webhook receiver is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`QuoteIQ webhook server running on port ${PORT}`);
});

module.exports = app;
