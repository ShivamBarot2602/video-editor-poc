# Sentry Integration Guide

This project now includes Sentry error tracking and performance monitoring for both the Express server and React client.

## Quick Start

### 1. Create a Sentry Project

1. Sign up at [sentry.io](https://sentry.io)
2. Create a new organization and project
3. Select "Node" for the server and "React" for the client
4. Copy the DSN for each project

### 2. Configure Environment Variables

#### Server (`app/server/.env`)

```bash
SENTRY_DSN=https://your-key@sentry.io/your-project-id
NODE_ENV=production  # Set to 'production' for lower tracesSampleRate
```

#### Client (`app/client/.env`)

```bash
VITE_SENTRY_DSN=https://your-key@sentry.io/your-project-id
```

### 3. Install Dependencies

```bash
# Server
cd app/server && yarn install

# Client
cd app/client && yarn install
```

## Features

### Server (Express)

- **Automatic Error Capturing**: All unhandled exceptions and promise rejections are captured automatically
- **Express Error Handler**: `Sentry.setupExpressErrorHandler()` captures all route errors  
- **Performance Monitoring**: Transaction tracing for API endpoints
- **Graceful Degradation**: If `SENTRY_DSN` is not set, Sentry is skipped entirely

### Client (React)

- **React Error Boundary**: Automatically captures React component errors
- **Performance Monitoring**: Component rendering performance is tracked via `withProfiler`
- **Session Replay**: Records user sessions (with privacy protections)
- **Console Integration**: JavaScript errors and warnings are captured

## Configuration Details

### Sampling

- **Development** (`NODE_ENV !== 'production'`): 100% of transactions sampled
- **Production**: 10% of transactions sampled
- **Session Replay**: 
  - Error sessions: 100% replayed
  - Normal sessions: 10% replayed (adjust `replaysOnErrorSampleRate` and `replaysSessionSampleRate`)

### Privacy

- **Maskable Text**: All text is masked in session replays by default (`maskAllText: true`)
- **Blocked Media**: Media files are blocked in replays (`blockAllMedia: true`)

## Usage

### Manual Error Reporting

You can manually capture exceptions or messages:

#### Server

```javascript
const Sentry = require('@sentry/node')

// Capture exception
Sentry.captureException(new Error('Something went wrong'))

// Capture message
Sentry.captureMessage('This is a message', 'info')

// Add context
Sentry.setContext('additional_info', {
  userId: '123',
  plan: 'pro'
})
```

#### Client

```javascript
import * as Sentry from '@sentry/react'

// Capture exception
Sentry.captureException(new Error('Something went wrong'))

// Capture message
Sentry.captureMessage('This is a message', 'info')

// Add context
Sentry.setContext('user_action', {
  action: 'upload_video',
  videoId: 'abc123'
})
```

## Disabling Sentry

If you don't want to use Sentry, simply leave the `SENTRY_DSN` environment variables unset:

- Server will skip Sentry initialization if `SENTRY_DSN` is not set
- Client will skip Sentry initialization if `VITE_SENTRY_DSN` is not set

## Monitoring

Once configured, visit your Sentry dashboard to see:

- **Issues**: Errors and exceptions grouped by type
- **Performance**: API endpoint response times and transactions
- **Session Replay**: Video recordings of user sessions when errors occur
- **Release Tracking**: Monitor errors across different app versions

## Troubleshooting

### Errors not appearing in Sentry?

1. Check that `SENTRY_DSN` is correctly set
2. Verify the DSN format starts with `https://`
3. In development, check browser/console for any Sentry warnings
4. Make sure the error actually occurred (test with `Sentry.captureMessage()`)

### Performance is slow?

- Reduce `tracesSampleRate` on the server (currently 10% in production)
- Reduce `replaysSessionSampleRate` on the client (currently 10%)
- Disable session replay entirely by setting `replaysSessionSampleRate: 0`

## References

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry React Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Sentry Session Replay](https://docs.sentry.io/product/session-replay/)
