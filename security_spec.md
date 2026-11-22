# Nirvana Library Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default-Deny Baseline:** Any collection or path not explicitly declared in `firestore.rules` is denied for both read and write.
2. **Verified Identity Requirement:** All authenticated operations require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Zero Privilege Escalation:** Regular users and students can never create, modify, or elevate records in `/admins/{uid}`. Only the verified bootstrap super-admin (`abhinavutkarsh3@gmail.com`) or an active registered admin can manage admin records.
4. **Strict Student PII Isolation:** A student may only read their own document in `/students/{studentId}` (where `uid == request.auth.uid`), their own `/memberships`, `/payments`, `/attendance`, and `/notifications`. Blanket reads across students or financial ledgers are strictly prohibited.
5. **Financial & Audit Immutability:** Records in `/payments`, `/audit_logs`, and `/access_logs` cannot be modified or deleted by students, and `/audit_logs` & `/access_logs` are strictly append-only (no update or delete).
6. **Temporal Integrity:** Server timestamps (`request.time`) are mandatory on `createdAt`, `updatedAt`, `paidAt`, and `timestamp` fields; client-forged timestamps are rejected.
7. **Strict Schema & Size Guards:** Every string field enforces explicit `.size()` bounds; every document ID on single-document operations passes `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `<= 128` chars); unknown/shadow fields are rejected via `hasOnly()`.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Class | Target Collection | Malicious Payload / Operation | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Unauthenticated Read | `/students/STU-001` | `get` with `auth == null` | `PERMISSION_DENIED` |
| 2 | Unverified Email Admin Spoof | `/admins/{uid}` | `get`/`write` with bootstrap email but `email_verified: false` | `PERMISSION_DENIED` |
| 3 | Self-Assigned Admin Escalation | `/admins/attacker_uid` | Non-admin creates `{ uid: "attacker_uid", role: "super_admin", active: true }` | `PERMISSION_DENIED` |
| 4 | Cross-Student PII Leak | `/students/STU-002` | Student A (`uid: "stuA"`) calls `get` on Student B (`uid: "stuB"`) | `PERMISSION_DENIED` |
| 5 | Blanket Student List Scrape | `/students` | Student A runs unfiltered `list` query without `uid == auth.uid` | `PERMISSION_DENIED` |
| 6 | Shadow Field Injection | `/students/STU-001` | Admin creates student with extra ghost field `isSuperUser: true` | `PERMISSION_DENIED` |
| 7 | Student Financial Forgery | `/payments/PAY-999` | Student tries to create a zero-due payment receipt | `PERMISSION_DENIED` |
| 8 | Payment Receipt Tampering | `/payments/PAY-001` | Update existing payment `amountPaid` or `receiptNo` | `PERMISSION_DENIED` |
| 9 | Audit Log Deletion / Tamper | `/audit_logs/LOG-001` | Even an admin attempts `update` or `delete` on `/audit_logs` | `PERMISSION_DENIED` |
| 10 | Document ID Poisoning | `/notices/../../evil$id` | Create notice with invalid path characters or >128 char ID | `PERMISSION_DENIED` |
| 11 | Notification Content Tamper | `/notifications/NOTIF-1` | Student updates `title` or `recipientUid` instead of only `read` + `updatedAt` | `PERMISSION_DENIED` |
| 12 | Client Timestamp Spoofing | `/expenses/EXP-001` | Admin submits backdated client timestamp instead of `request.time` | `PERMISSION_DENIED` |
