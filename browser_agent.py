import os
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from humanize import human_scroll, random_delay, human_mouse_move
from config import BROWSERLESS_TOKEN, IG_USER, IG_PASS
from utils import log

# Initialize stealth configuration
stealth = Stealth()


async def get_page():
    """Initialize browser connection and return page, context, and playwright instance."""
    pw = await async_playwright().start()
    
    # Connect to Browserless.io cloud browser
    browser = await pw.chromium.connect_over_cdp(
        f"wss://chrome.browserless.io?token={BROWSERLESS_TOKEN}&--disable-web-security&--no-sandbox"
    )
    
    context = await browser.new_context(
        viewport={"width": 1920, "height": 1080},
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    
    page = await context.new_page()
    await stealth.apply_stealth_async(page)
    
    return page, context, pw


async def login(page):
    """Login to Instagram."""
    log("Navigating to Instagram login...")
    await page.goto("https://www.instagram.com/accounts/login/")
    await random_delay(3, 6)
    
    # Wait for login form to load
    await page.wait_for_selector('input[name="username"]', timeout=15000)
    
    log("Filling login credentials...")
    await page.fill('input[name="username"]', IG_USER)
    await random_delay(0.5, 1.0)
    await page.fill('input[name="password"]', IG_PASS)
    await random_delay(0.5, 1.0)
    
    # Click login button
    await page.click('button[type="submit"]')
    await random_delay(6, 10)
    
    # Handle "Save login info" popup
    try:
        await page.click('button:has-text("Not Now")', timeout=8000)
        log("Dismissed 'Save login info' popup")
    except:
        pass
    
    # Handle notifications popup
    try:
        await page.click('button:has-text("Not Now")', timeout=5000)
        log("Dismissed notifications popup")
    except:
        pass
    
    log("Login complete!")


async def go_to_profile(page, username: str):
    """Navigate to a user's profile."""
    clean_username = username.strip().lstrip("@")
    url = f"https://www.instagram.com/{clean_username}/"
    log(f"Navigating to profile: {clean_username}")
    await page.goto(url)
    await random_delay(2, 4)
    await human_mouse_move(page)


async def open_followers(page):
    """Click on the followers link to open followers modal."""
    try:
        # Try different selectors for the followers link
        selectors = [
            'a[href$="/followers/"]',
            'a:has-text("followers")',
            '[href*="/followers"]'
        ]
        
        for selector in selectors:
            try:
                await page.click(selector, timeout=5000)
                log("Opened followers modal")
                await random_delay(2, 4)
                return True
            except:
                continue
        
        log("Could not find followers link", "WARN")
        return False
    except Exception as e:
        log(f"Error opening followers: {e}", "ERROR")
        return False


async def scroll_followers_modal(page, scroll_count: int = 5):
    """Scroll within the followers modal to load more followers."""
    try:
        # The followers modal typically has a scrollable div
        modal_selector = 'div[role="dialog"] div[style*="overflow"]'
        
        for i in range(scroll_count):
            await page.evaluate(f"""
                const modal = document.querySelector('{modal_selector}');
                if (modal) modal.scrollTop += 500;
            """)
            await random_delay(1, 2)
            log(f"Scrolled followers modal ({i+1}/{scroll_count})")
    except Exception as e:
        log(f"Error scrolling modal: {e}", "WARN")


async def send_dm(page, username: str, message: str) -> bool:
    """Send a DM to a user. Returns True if successful."""
    try:
        log(f"Attempting to send DM to {username}")
        
        # Navigate to the user's profile first
        await go_to_profile(page, username)
        await random_delay(1, 2)
        
        # Click the Message button
        try:
            await page.click('div:has-text("Message"):not(:has(div))', timeout=5000)
        except:
            # Try alternative selector
            await page.click('[role="button"]:has-text("Message")', timeout=5000)
        
        await random_delay(2, 4)
        
        # Type the message
        message_input = await page.wait_for_selector('textarea[placeholder*="Message"]', timeout=10000)
        await message_input.fill(message)
        await random_delay(0.5, 1)
        
        # Send the message
        await page.click('button:has-text("Send")', timeout=5000)
        await random_delay(1, 2)
        
        log(f"DM sent to {username}")
        return True
        
    except Exception as e:
        log(f"Failed to send DM to {username}: {e}", "ERROR")
        return False


async def take_screenshot(page, path: str):
    """Take a screenshot and save to path."""
    await page.screenshot(path=path, full_page=False)
    log(f"Screenshot saved: {path}")
    return path
