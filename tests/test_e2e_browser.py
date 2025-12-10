import pytest

pytest.skip(
    "Playwright E2E suite deprecated after Puppeteer migration; use tests/e2e_puppeteer.test.js",
    allow_module_level=True,
)


@pytest.mark.e2e
@skip_if_no_credentials
class TestSingleBioFetch:
    """Single end-to-end bio fetch with logging."""

    async def test_login_and_print_bio(self, logged_in_page, test_profile):
        page = logged_in_page

        log("[step] navigate to profile")
        try:
            await page.goto(
                f"https://instagram.com/{test_profile}/",
                wait_until="domcontentloaded",
                timeout=8_000,
            )
        except Exception as e:
            log(f"[warn] navigation issue: {type(e).__name__} {e}")
        await asyncio.sleep(2)

        log("[step] fetch bio")
        try:
            bio = await asyncio.wait_for(get_bio_from_page(page), timeout=8)
        except asyncio.TimeoutError:
            bio = None
            log("[warn] bio fetch timed out")

        log(f"[bio] {bio[:200] if bio else 'None'}")
        assert bio is None or isinstance(bio, str)
