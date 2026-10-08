# Authentication & Security Implementation Plan: Identity Number (ID) & Password

This plan establishes industrial-grade authentication and access control for the Edge AI Motor Health Monitoring Dashboard using an **Identity Number (ID / Operator Badge)** and **Password**, protecting telemetry, controls, and diagnostics.

---

## User Review Required

> [!IMPORTANT]
> - Default accounts will be configured for quick testing (e.g. `ENG-101`, `OP-202`, `ADMIN-001` with default password `motor123`), while allowing you to enter custom Identity Numbers and passwords.
> - Authentication will be enforced across both the frontend UI and the backend REST / WebSocket endpoints.
> - A user profile dropdown with a **Log Out** button will be integrated into the top navigation bar.

---

## Proposed Changes

### Backend Security Layer (`server.ts`)

#### [MODIFY] [server.ts](file:///t:/anti%20projects/Motor%20Health%20Monitoring%20Deshboard/server.ts)
- Add user repository with Identity Numbers (e.g., `ENG-101`, `OP-202`, `ADMIN-001`), hashed/hashed-equivalent passwords, names, roles, and permissions.
- Implement `/api/auth/login` endpoint:
  - Validates `id` (Identity Number) and `password`.
  - Issues a cryptographically generated session token.
  - Returns user metadata (ID, name, role, department, avatar initials).
- Implement `/api/auth/verify` endpoint:
  - Validates active session token on browser refresh.
- Implement `/api/auth/logout` endpoint:
  - Revokes the active session token.
- Add authentication middleware for REST endpoints (`/api/motor/control` and sensitive settings).
- Protect WebSocket `/ws` connection with token validation (accepts `?token=...` or sends auth challenge).

---

### Type Definitions (`src/types.ts`)

#### [MODIFY] [types.ts](file:///t:/anti%20projects/Motor%20Health%20Monitoring%20Deshboard/src/types.ts)
- Add `AuthUser` interface:
  - `id`: string (e.g., `'ENG-101'`)
  - `name`: string (e.g., `'Dr. Chris Moorhouse'`)
  - `role`: `'ENGINEER' | 'OPERATOR' | 'ADMIN'`
  - `roleTitle`: string (e.g., `'Lead Reliability Engineer'`)
  - `station`: string (e.g., `'Unit-4 Induction Drives'`)
  - `token`: string
- Add `AuthCredentials` interface (`id: string; password: string; rememberMe?: boolean`).

---

### Frontend Components

#### [NEW] [LoginScreen.tsx](file:///t:/anti%20projects/Motor%20Health%20Monitoring%20Deshboard/src/components/LoginScreen.tsx)
- Create a modern, high-tech industrial authentication interface matching the MobiusAI dark aesthetic:
  - **Identity Number Field**: Input for Badge/Employee/Operator ID (with formatting and icon).
  - **Password Field**: Secure password input with visibility toggle.
  - **Validation & Error Feedback**: Informative error banner for invalid credentials.
  - **Quick Role Access Badges**: One-click demo credential chips for rapid evaluation:
    - *Lead Reliability Engineer* (`ENG-101`)
    - *Plant Condition Operator* (`OP-202`)
    - *System Administrator* (`ADMIN-001`)
  - **Industrial Compliance Badges**: "IEC 62443 Industrial Cybersecurity Compliant", "256-Bit Edge Encrypted Session".

#### [MODIFY] [Header.tsx](file:///t:/anti%20projects/Motor%20Health%20Monitoring%20Deshboard/src/components/Header.tsx)
- Replace static user profile with dynamic authenticated user info (`user.name`, `user.id`, `user.roleTitle`).
- Add active role badge (e.g., `ENG-101` in cyan/amber pill).
- Add a **Logout / Lock Station** button that terminates the session and returns to the login screen.

#### [MODIFY] [App.tsx](file:///t:/anti%20projects/Motor%20Health%20Monitoring%20Deshboard/src/App.tsx)
- Add authentication state (`authUser`, `authLoading`).
- On app mount, check `localStorage` for an existing valid token and verify with `/api/auth/verify`.
- If unauthenticated, render `<LoginScreen onLoginSuccess={handleLoginSuccess} />`.
- If authenticated, render the full dashboard and pass user context and auth headers to API calls and WebSocket connections.
- Handle session expiry and logout.

---

## Verification Plan

### Automated Tests & Code Validation
1. **Lint & Type Check**:
   ```powershell
   npm run lint
   ```
   Ensure zero TypeScript compilation errors.
2. **Production Bundle**:
   ```powershell
   npm run build
   ```
   Ensure clean client and server bundles.

### Manual Verification
1. **Login Flow**:
   - Access `http://localhost:3000`.
   - Verify that the login portal appears with Identity Number (ID) and Password fields.
   - Test invalid ID/Password rejection with error notice.
   - Test login with `ENG-101` / `motor123`.
   - Confirm immediate transition to the live dashboard.
2. **Session Persistence**:
   - Refresh the page and confirm the user remains logged in without re-entering credentials.
3. **Header Badge & Role**:
   - Verify the top bar displays `ENG-101`, user name, role, and logout button.
4. **Logout Flow**:
   - Click the **Log Out** button; confirm immediate redirection to the login portal and revocation of the session token.
5. **API Protection**:
   - Verify that requests without a valid token are rejected with HTTP 401.
