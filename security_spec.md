# Security Specification (TDD) - Virul AI Chat Sync

## 1. Data Invariants
- **Auth Integrity**: Users can only read, create, update, or delete their own chat documents (`userId == request.auth.uid`).
- **Identifier Hardening**: All chat document IDs (`chatId`) must be valid alphanumeric strings of reasonable size.
- **Timestamp Integrity**: All server timestamps (`updatedAt`) must match `request.time` on writes.
- **Immutability of Key Fields**: Once created, the owner identity (`userId`) of a chat document cannot be modified or spoofed.
- **Type/Boundary Controls**: All incoming payload fields must be type-safe (e.g., `id` is a string, `title` is a string, `messages` is a list, `pinned` is a boolean).

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads represent unauthorized operations designed to bypass identity, integrity, and temporal structures. All of these must fail with `PERMISSION_DENIED`:

### P1: Unauthorized Document Creation (Identity Spoofing)
An unauthenticated guest or user trying to create a chat document setting the owner `userId` to another user's UID.
```json
{
  "id": "malicious-chat-1",
  "title": "Hack Chat",
  "messages": [],
  "pinned": false,
  "userId": "victim_user_123",
  "updatedAt": 178229411585
}
```

### P2: Anonymous Write Attempt
An anonymous user trying to save chats without a verified / active authenticated session.
```json
{
  "id": "anonymous-chat-2",
  "title": "Anon",
  "messages": [],
  "pinned": false,
  "userId": "anon",
  "updatedAt": 178229411585
}
```

### P3: Session Hijacking (Reading Other's Chats)
Authenticated user A attempting to fetch/read general chats where `userId == B`.
*(Should fail due to security rule evaluating resource.data.userId == request.auth.uid)*

### P4: Owner ID Tampering (Hostile Takeover)
Authenticated user updating an existing chat owned by them to assign ownership to someone else or taking over someone else's chat.
```json
// Attempting to change `userId` from "my-uid" to "other-uid"
{
  "id": "owned-chat-123",
  "title": "Modified title",
  "userId": "other-uid",
  "updatedAt": 178229411585
}
```

### P5: Timestamp Spoofing (Historical/Future Faking)
An attacker trying to set `updatedAt` to a future or far-past time to tamper with syncing sorting metrics.
```json
{
  "id": "owned-chat-123",
  "title": "Nice Title",
  "pinned": false,
  "userId": "my-uid",
  "updatedAt": 12345 // hardcoded far-past epoch instead of request.time
}
```

### P6: Path Injection/ID Poisoning
Injecting massive string payloads (e.g., 200KB of metadata) directly into standard IDs or matching subpaths.
*(Blocked by strict ID match pattern checking sizes and regex format limits)*

### P7: Ghost Fields (Shadow Update Attack)
An update payload adding unapproved or hidden fields (e.g., `role: "admin"` or `isAdmin: true`) directly to the chat document.
```json
{
  "id": "owned-chat-123",
  "title": "Tainted",
  "userId": "my-uid",
  "updatedAt": 178229411585,
  "isAdmin": true
}
```

### P8: Malformed Data Types (Value Poisoning)
Writing an update where the `pinned` field is set to a string instead of a boolean, or the `title` is set to a raw list/map instead of a string.
```json
{
  "title": ["Not", "A", "String"],
  "pinned": "not-boolean"
}
```

### P9: Messages Field Over-Size Attack (Denial of Wallet)
Pushing an excessively massive list of dummy messages to exceed document memory boundaries and inflate database costs.
*(Prevented by limiting length/structure bounds of the messages array)*

### P10: Missing Vital Fields on Creation
Attempting to create a chat document with missing `userId` or `title` fields.
```json
{
  "id": "owned-chat-123",
  "pinned": false
}
```

### P11: Document ID Mismatch
Attempting to create a document where the nested property `id` does not match the resource key name/path identifier.
```json
// Path: /chats/chat-xyz
{
  "id": "chat-abc", // Mismatch!
  "title": "Sneaky",
  "userId": "my-uid",
  "updatedAt": 178229411585
}
```

### P12: Rogue Deletion Attempt
User B attempting to issue a hard delete against user A's chat resource path.
*(Blocked by requiring resource.data.userId == request.auth.uid)*

---

## 3. The Test Validation Logic
These security rules will be tested to verify that:
- Authentic requests passing all conditions are allowed.
- Any request with any properties from P1 through P12 is cleanly rejected with a `PERMISSION_DENIED` error.
