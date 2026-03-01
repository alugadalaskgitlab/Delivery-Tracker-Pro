# DispatchFlow

## Overview

DispatchFlow is a full-stack dispatch management application for material/mix deliveries. It handles delivery challans, live status updates, and site acknowledgements with role-based access control for three user types: Admin, Plant, and Site users.

The application tracks dispatches from creation at the plant, through arrival at the site, to departure, with automatic challan number generation and quantity tracking per party/order.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **Session Management**: express-session with server-side storage
- **Authentication**: PIN-based login for Admin/Plant roles, token-based access for Site users
- **Password Hashing**: bcrypt for secure credential storage

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` (shared between client and server)

### Authentication & Authorization
- **Three Roles**: ADMIN (full access), PLANT (dispatch creation only), SITE (acknowledgement only)
- **Admin/Plant**: PIN-based authentication stored in app_settings table
- **Site**: Token-based access linked to specific parties, can be deactivated when orders are closed
- **Session**: HTTP-only cookies with configurable expiry

### Key Data Models
- **Users**: Store credentials and role information
- **Parties**: Customer/order entities with unique party codes and access IDs
- **Dispatches**: Individual shipments with auto-generated challan numbers (format: PARTYCODE-0001)
- **Site Tokens**: Access tokens for site users linked to specific parties
- **Party Sequences**: Track sequential challan numbering per party
- **App Settings**: Key-value store for system configuration (PINs, etc.)
- **Push Subscriptions**: Web Push notification subscriptions per device/user

### Push Notifications (Web Push)
- **Service Worker**: `client/public/sw.js` handles push events and displays notifications
- **Server Module**: `server/push-notifications.ts` sends push via `web-push` library with VAPID keys
- **Frontend Utility**: `client/src/lib/push-notifications.ts` manages subscription lifecycle
- **UI Component**: `client/src/components/NotificationToggle.tsx` - bell icon on all pages
- **Events**: Notifications sent on dispatch creation, site arrived, and site left/unloaded
- **iOS**: Users must add app to Home Screen (PWA) for background push support
- **Android**: Works in browser and as PWA

### API Structure
- RESTful endpoints under `/api/` prefix
- Session-based authentication with role middleware
- Endpoints for auth, parties, dispatches, and site acknowledgements

## External Dependencies

### Database
- PostgreSQL (required, connection via DATABASE_URL environment variable)
- Drizzle Kit for migrations (`npm run db:push`)

### Key NPM Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM and validation
- `express-session`: Session management
- `bcrypt`: Password hashing
- `@tanstack/react-query`: Client-side data fetching
- `date-fns`: Date formatting utilities
- Radix UI primitives: Accessible UI components

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption (defaults to dev value)
- `VAPID_PUBLIC_KEY`: Web Push VAPID public key
- `VAPID_PRIVATE_KEY`: Web Push VAPID private key
- `VAPID_SUBJECT`: Web Push VAPID subject (mailto: URI)

### Push Notifications (Web Push)
- **Service Worker**: `client/public/sw.js` handles push events and displays notifications
- **Server Module**: `server/push-notifications.ts` sends push via `web-push` library with VAPID keys
- **Frontend Utility**: `client/src/lib/push-notifications.ts` manages subscription lifecycle
- **UI Component**: `client/src/components/NotificationToggle.tsx` - bell icon on all pages
- **Events**: Notifications sent on dispatch creation, site arrived, and site left/unloaded
- **iOS**: Users must add app to Home Screen (PWA) for background push support
- **Android**: Works in browser and as PWA

### Key NPM Packages (additional)
- `web-push`: Web Push protocol for server-side push notifications

### PWA Icons
- **Main app** (blue): `icon-192.png`, `icon-512.png` — dark navy (#2B3E5C) background
- **Site pages** (green): `site-icon-192.png`, `site-icon-512.png` — forest green (#2E7D32) background
- Dynamic manifest served via `GET /api/manifest?path=<current_path>` — returns correct icons, theme color, start_url, and short_name ("DP Site") based on whether the path is a site page
- `client/index.html` script sets manifest link href to the server endpoint and swaps apple-touch-icon/theme-color for site pages

### Development Tools
- Vite dev server with HMR
- Replit-specific plugins for development banners and cartographer
- Custom meta images plugin for OpenGraph tags