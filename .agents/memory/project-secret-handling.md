---
name: Project secret handling
description: Project rule for storing and rotating credentials safely.
---

Store credential values only in Replit Secrets. Do not put secret values in `.replit`, application code, reports, or commits. Reports may name the secret but must not include its value.

**Why:** The user required this after a VAPID private key was found in tracked project settings and pushed to GitHub.

**How to apply:** Before committing or pushing, inspect changed config and report files for credential values. If a credential was already committed, rotate it; only rewrite history with explicit approval.
