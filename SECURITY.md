# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the latest version of Creator Scout.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please send an email to the maintainers or open a [private security advisory](https://github.com/BenSheridanEdwards/CreatorScout/security/advisories/new) on GitHub.

Include as much of the following information as possible:

- Type of vulnerability
- Full path of the affected source file(s)
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days. We may ask for additional information or guidance.

## Security Best Practices

When running Creator Scout:

- **Never commit `.env`** – It's in `.gitignore`; keep credentials out of version control
- **Use strong, unique passwords** for Instagram, SmartProxy, and database
- **Enable 2FA** on all services when available
- **Rotate credentials** periodically
- **Restrict API access** – Use firewall rules to limit who can reach your VPS
- **See [docs/SECURITY.md](docs/SECURITY.md)** for VPS hardening and deployment security
