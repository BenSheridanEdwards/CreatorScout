"""Legacy Playwright conftest deprecated after Puppeteer migration."""
import pytest

pytest.skip(
    "Playwright fixtures removed; use Puppeteer E2E under tests/e2e_puppeteer.test.js",
    allow_module_level=True,
)
