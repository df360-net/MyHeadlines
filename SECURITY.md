# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in MyHeadlines, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email **df360.net@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 48 hours. We will work with you to understand and address the issue before any public disclosure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Design

MyHeadlines is designed as a **local-first application**:

- The server binds to `127.0.0.1` only (not accessible from the network)
- All user data is stored locally in SQLite
- API keys are stored in the local database, never transmitted to third parties
- Email delivery uses encrypted connections (TLS) via Amazon SES or Resend
- No analytics, tracking, or telemetry
