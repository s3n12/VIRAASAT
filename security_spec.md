# VIRAASAT Firestore Security Specification (Phase 0)

## Data Invariants
1. **Default Deny**: Unmatched collections and documents are denied for all read and write operations.
2. **PII Isolation**: User email, phone number, and shipping addresses live strictly in `/users/{userId}/private/{docId}` and are readable/writable only by `isOwner(userId)` or `isAdmin()`.
3. **Anti-Privilege-Escalation**: Users cannot create their public profile with `role != 'customer'`, cannot self-promote `role` or set `emailVerified`/`phoneVerified` via client updates, and cannot write to `/admins/{uid}`.
4. **Master Gate**: Subcollections (`/users/{userId}/wishlist/{productId}`, `/products/{productId}/reviews/{reviewId}`) validate parent existence using `exists()`.
5. **Terminal State Locking**: Orders with terminal status (`delivered`, `cancelled`, `refunded`) cannot be modified by non-admins.
6. **Immutable Audit Trail**: Documents in `/auditLogs/{logId}` are append-only by admins and can never be updated or deleted.
7. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`.
8. **Query Enforcement**: Every `allow list` on private collections (`orders`, `notifications`) enforces `resource.data.userId == request.auth.uid` (or `resource.data.sellerId == request.auth.uid`) without `get()`/`exists()` calls.

## The "Dirty Dozen" Adversarial Payloads
1. **Self-Assigned Admin Role on Signup**: `create /users/u1` with `{ role: "admin", ... }` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection**: `create /users/u1` with extra ghost key `{ isSuperAdmin: true }` -> `PERMISSION_DENIED`.
3. **PII Cross-User Read**: `get /users/u2/private/info` authenticated as `u1` -> `PERMISSION_DENIED`.
4. **Unverified Admin Email Spoof**: `update /cms/hero` with `token.email == "shaninishad813@gmail.com"` and `email_verified == false` -> `PERMISSION_DENIED`.
5. **ID Poisoning Attack**: `create /products/<200-char-junk-id>` -> `PERMISSION_DENIED` by `isValidId()`.
6. **Value Poisoning on Allowed Update Key**: `update /orders/ord1` changing `status` to an invalid string `"hacked"` -> `PERMISSION_DENIED` by `isValidOrder()`.
7. **Terminal Order Mutation**: `update /orders/ord1` where `existing().status == "delivered"` by non-admin -> `PERMISSION_DENIED`.
8. **Orphaned Review Creation**: `create /products/nonexistent/reviews/r1` -> `PERMISSION_DENIED` by Master Gate `exists()`.
9. **Client Timestamp Spoofing**: `create /products/p1/reviews/r1` with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Audit Log Tampering**: `delete /auditLogs/log1` or `update /auditLogs/log1` even as admin -> `PERMISSION_DENIED`.
11. **Seller Impersonation**: `create /products/p9` with `sellerId: "otherSeller"` while signed in as `sellerA` -> `PERMISSION_DENIED`.
12. **Blanket Private Collection List Scrape**: `list /orders` without filtering to `userId == request.auth.uid` -> `PERMISSION_DENIED`.
