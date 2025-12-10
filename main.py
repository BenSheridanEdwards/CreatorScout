"""
Scout - Instagram Patreon Creator Discovery Agent

Flow:
1. Go to seed profile → click Following → open modal
2. Get <li> list items from following modal
3. For each profile (batch of 10):
   - Skip if already visited
   - Click into profile, read bio
   - Keyword/emoji matching on bio (cheap)
   - If promising: click linktree, screenshot, vision analysis (expensive)
4. If confirmed creator:
   - Check DM thread empty → send DM
   - Follow if not following
   - Mark in database
   - Click their Following → repeat process
5. Pagination: if all 10 visited, scroll modal and get next batch
"""

import asyncio
import random
import os
from datetime import datetime

from database import (
    init_db, queue_add, queue_next, queue_count,
    was_visited, mark_visited, mark_as_creator,
    was_dm_sent, mark_dm_sent, was_followed, mark_followed,
    get_scroll_index, update_scroll_index, get_stats
)
from browser_agent import new_page, login
from bio_matcher import is_likely_creator, calculate_score
from vision import is_confirmed_creator
from humanize import rnd, delay, get_delay, get_timeout, human_scroll, mouse_wiggle
from utils import save_proof
from config import (
    MAX_DMS_PER_DAY,
    DM_MESSAGE,
    CONFIDENCE_THRESHOLD,
    SKIP_VISION,
    FAST_MODE,
)

init_db()

BATCH_SIZE = 10  # Process 10 profiles at a time from following list


def _log(msg):
    print(msg, flush=True)


async def click_selector(page, selector: str, timeout: int | None = None) -> bool:
    if timeout is None:
        timeout = get_timeout("element_default")
    el = await page.wait_for_selector(selector, timeout=timeout)
    if el:
        await el.click()
        return True
    return False

async def get_bio_from_page(page) -> str | None:
    """Extract bio text from current profile page."""
    _log("    [bio] Starting bio extraction...")
    try:
        # Instagram bio is typically in a span or div in the header section
        bio_selectors = [
            'header section > div.-vDIg > span',
            'header section span:not([class])',
            'div[class*="biography"]',
            'section > div > span',
        ]
        
        for i, selector in enumerate(bio_selectors):
            _log(f"    [bio] Trying selector {i+1}/{len(bio_selectors)}: {selector[:40]}...")
            try:
                element = await page.query_selector(selector)
                if element:
                    _log(f"    [bio] Found element, getting text...")
                    text = await element.inner_text()
                    if text and len(text) > 10:
                        _log(f"    [bio] Got text: {text[:30]}...")
                        return text
                    _log(f"    [bio] Text too short or empty")
            except Exception as e:
                _log(f"    [bio] Selector failed: {e}")
                continue
        
        # Fallback: get all text from header
        _log("    [bio] Trying fallback: header text")
        header = await page.query_selector('header')
        if header:
            text = await header.inner_text()
            _log(f"    [bio] Got header text: {text[:30] if text else 'None'}...")
            return text
            
    except Exception as e:
        _log(f"    [bio] Error: {e}")
    
    _log("    [bio] No bio found")
    return None


async def get_link_from_bio(page) -> str | None:
    """Extract external link from profile bio."""
    try:
        # Look for the external link in bio
        link_selectors = [
            'header a[href*="linktr.ee"]',
            'header a[href*="beacons.ai"]',
            'header a[href*="allmylinks"]',
            'header a[href*="patreon.com"]',
            'header a[rel="me nofollow noopener"]',
            'header section a[target="_blank"]',
        ]
        
        for selector in link_selectors:
            try:
                element = await page.query_selector(selector)
                if element:
                    href = await element.get_attribute('href')
                    if href:
                        return href
            except:
                continue
                
    except Exception as e:
        print(f"  Could not extract link: {e}")
    
    return None


async def extract_following_usernames(page, start_index: int = 0, count: int = BATCH_SIZE) -> list[str]:
    """
    Extract usernames from the Following modal.
    Returns list of usernames starting from start_index.
    """
    usernames = []
    
    try:
        # Wait for the modal to be present
        await page.wait_for_selector('div[role="dialog"]', timeout=get_timeout("element_modal"))
        await delay("after_modal_open")
        
        # Try multiple selectors for following modal
        modal_selectors = [
            'div[role="dialog"] a[role="link"][href^="/"]',  # Current
            'div[role="dialog"] ul > li a[href^="/"]',       # Suggested
            'div[role="dialog"] li a[href^="/"]',            # Generic
        ]

        items = []
        for selector in modal_selectors:
            items = await page.query_selector_all(selector)
            if items:
                break
        
        # Extract usernames from href attributes
        for i, item in enumerate(items):
            if i < start_index:
                continue
            if len(usernames) >= count:
                break
                
            try:
                href = await item.get_attribute('href')
                if href and href.startswith('/') and href.count('/') == 2:
                    username = href.strip('/')
                    if username and not username.startswith('explore'):
                        usernames.append(username)
            except:
                continue
                
    except Exception as e:
        print(f"  Error extracting usernames: {e}")
    
    return usernames


async def scroll_modal(page, times: int = 3):
    """Scroll within the following modal to load more items."""
    try:
        for _ in range(times):
            await page.evaluate('''
                const modal = document.querySelector('div[role="dialog"] div[style*="overflow"]');
                if (modal) modal.scrollTop += 500;
            ''')
            await delay("after_scroll")
    except:
        pass


async def check_dm_thread_empty(page) -> bool:
    """Check if DM thread is empty (no previous messages)."""
    dm_selectors = [
        'div[role="row"]',
        'div[role="listitem"]',
        'div[data-scope="messages_table"] > div',
    ]
    
    for selector in dm_selectors:
        try:
            messages = await page.query_selector_all(selector)
            if messages:
                return len(messages) <= 1
        except:
            continue
    
    return True  # Assume empty if nothing found


async def process_profile(username: str, page) -> dict:
    """
    Process a single profile:
    1. Visit profile, read bio
    2. Keyword match bio
    3. If promising, explore linktree with vision
    4. If confirmed creator, DM and follow
    
    Returns dict with results.
    """
    result = {
        "username": username,
        "visited": True,
        "bio_score": 0,
        "is_creator": False,
        "dm_sent": False,
        "followed": False,
        "explore_following": False
    }
    
    print(f"\n  → Checking {username}")
    
    # Navigate to profile
    await page.goto(f"https://instagram.com/{username}/")
    await delay("after_navigate")
    await mouse_wiggle(page)

    # Check if account is private
    try:
        private_text = await page.query_selector('text="This account is private"')
        if private_text:
            print(f"    Account is private, skipping")
            mark_visited(username, bio_score=0)
            return result
    except:
        pass

    # Extract bio
    bio = await get_bio_from_page(page)
    link_url = await get_link_from_bio(page)
    
    if not bio:
        print(f"    No bio found, skipping")
        mark_visited(username, bio_score=0)
        return result
    
    # === STEP 1: Keyword/emoji matching (cheap) ===
    is_likely, match_data = is_likely_creator(bio, threshold=40)
    result["bio_score"] = match_data["score"]
    
    print(f"    Bio score: {match_data['score']} | Emojis: {match_data['emojis']} | Keywords: {match_data['keywords'][:3]}")
    
    mark_visited(username, bio=bio, bio_score=match_data["score"], link_url=link_url)
    
    if not is_likely:
        print(f"    Score too low, skipping")
        return result
    
    # === STEP 2: If promising and has link, explore with vision ===
    if link_url and match_data["score"] >= 40:
        if SKIP_VISION:
            print("    FAST_MODE/SKIP_VISION enabled - skipping linktree vision step")
        else:
            print(f"    Exploring linktree: {link_url[:50]}...")
            
            try:
                # Click the link to open linktree
                link_element = await page.query_selector(f'a[href="{link_url}"]')
                if link_element:
                    await link_element.click()
                    await delay("after_linktree_click")
                    
                    # Screenshot the linktree page
                    os.makedirs("screenshots", exist_ok=True)
                    screenshot_path = f"screenshots/linktree_{username}_{int(datetime.now().timestamp())}.png"
                    await page.screenshot(path=screenshot_path)
                    
                    # Vision analysis
                    is_creator, vision_data = is_confirmed_creator(screenshot_path, threshold=CONFIDENCE_THRESHOLD)
                    
                    if vision_data:
                        print(f"    Vision: creator={is_creator}, confidence={vision_data.get('confidence', 0)}")
                        print(f"    Indicators: {vision_data.get('indicators', [])}")
                    
                    if is_creator:
                        result["is_creator"] = True
                        mark_as_creator(username, confidence=vision_data.get("confidence", 0), proof_path=screenshot_path)
                    
                    # Go back to profile
                    await page.go_back()
                    await delay("after_go_back")
                    
            except Exception as e:
                print(f"    Error exploring linktree: {e}")
    
    # High bio score alone can indicate creator (e.g., direct creator mention)
    elif match_data["score"] >= 70:
        print(f"    High bio score - likely creator")
        result["is_creator"] = True
        mark_as_creator(username, confidence=match_data["score"])
    
    # === STEP 3: If confirmed creator, send DM and follow ===
    if result["is_creator"]:
        
        # Check if we already DMed
        if was_dm_sent(username):
            print(f"    Already DMed, skipping")
        else:
            try:
                # Click Message button
                handle = await page.wait_for_selector('div[role="button"]', timeout=get_timeout("element_button"))
                if handle:
                    await handle.click()
                await delay("after_message_open")
                
                # Check if thread is empty
                if await check_dm_thread_empty(page):
                    el = await page.wait_for_selector('textarea[placeholder*="Message"]', timeout=get_timeout("element_input"))
                    if el:
                        await el.click()
                        await page.type('textarea[placeholder*="Message"]', DM_MESSAGE)
                    await delay("after_dm_type")
                    await page.keyboard.press("Enter")
                    await delay("after_dm_send")
                    
                    # Screenshot proof
                    proof_path = await save_proof(username, page)
                    
                    mark_dm_sent(username, proof_path)
                    result["dm_sent"] = True
                    print(f"    ✓ DM sent!")
                else:
                    print(f"    Thread not empty, skipping DM")
                
                # Go back to profile
                await page.go_back()
                await delay("after_go_back")
                
            except Exception as e:
                print(f"    DM failed: {e}")
        
        # Follow if not already
        if not was_followed(username):
            try:
                btn = await page.wait_for_selector('button', timeout=get_timeout("follow"))
                if btn:
                    await btn.click()
                mark_followed(username)
                result["followed"] = True
                print(f"    ✓ Followed!")
                await delay("after_follow")
            except:
                pass  # Might already be following
        
        # Mark to explore their following list
        result["explore_following"] = True
    
    return result


async def process_following_list(seed_username: str, page):
    """
    Process the Following list of a seed profile.
    Implements pagination when all profiles in batch are visited.
    """
    print(f"\n{'='*50}")
    print(f"Processing Following of: {seed_username}")
    print(f"{'='*50}")
    
    # Navigate to seed profile
    await page.goto(f"https://instagram.com/{seed_username}/")
    await delay("after_navigate")
    await human_scroll(page, 2)
    
    # Click Following to open modal
    try:
        ok = await click_selector(page, 'a[href$="/following/"]', timeout=get_timeout("element_default"))
        await delay("after_modal_open")
        if not ok:
            print("Could not open following modal")
            return
    except Exception as e:
        print(f"Could not open following modal: {e}")
        return
    
    # Get starting scroll index (for pagination)
    scroll_index = get_scroll_index(seed_username)
    
    # Scroll to previous position if resuming
    if scroll_index > 0:
        print(f"Resuming from index {scroll_index}")
        await scroll_modal(page, times=scroll_index // 5)
    
    new_profiles_found = 0
    creators_found = 0
    consecutive_all_visited = 0
    
    while consecutive_all_visited < 3:  # Stop after 3 batches of all-visited
        # Extract usernames from modal
        usernames = await extract_following_usernames(page, start_index=scroll_index, count=BATCH_SIZE)
        
        if not usernames:
            print("No more usernames to extract")
            break
        
        print(f"\nBatch starting at index {scroll_index}: {len(usernames)} usernames")
        
        # Process each username
        all_visited = True
        for username in usernames:
            if was_visited(username):
                print(f"  [skip] {username} - already visited")
                continue
            
            all_visited = False
            new_profiles_found += 1
            
            # Close the modal before visiting profile
            await page.keyboard.press("Escape")
            await delay("after_modal_close")
            
            # Process this profile
            result = await process_profile(username, page)
            
            if result["is_creator"]:
                creators_found += 1
                
                # If confirmed creator, add their following to queue for later
                if result["explore_following"]:
                    queue_add(username, priority=50, source=f"following_of_{seed_username}")
                    print(f"    Added {username}'s following to queue")
            
            # Re-open the following modal
            await page.goto(f"https://instagram.com/{seed_username}/")
            await delay("after_navigate")
            await click_selector(page, 'a[href$="/following/"]', timeout=get_timeout("element_default"))
            await delay("after_modal_open")
            
            # Scroll back to position
            if scroll_index > 0:
                await scroll_modal(page, times=scroll_index // 5)
            
            # Random delay between profiles
            await delay("between_profiles")
        
        # Update pagination
        scroll_index += BATCH_SIZE
        update_scroll_index(seed_username, scroll_index)
        
        if all_visited:
            consecutive_all_visited += 1
            print(f"All {BATCH_SIZE} profiles in batch already visited ({consecutive_all_visited}/3)")
        else:
            consecutive_all_visited = 0
        
        # Scroll modal for next batch
        await scroll_modal(page, times=2)
        await delay("after_scroll_batch")
    
    print(f"\nFinished {seed_username}: {new_profiles_found} new profiles, {creators_found} creators found")
    
    # Close modal
    await page.keyboard.press("Escape")


async def main():
    print("=" * 60)
    print("  Scout - Instagram Patreon Creator Discovery Agent")
    print("=" * 60)
    
    # Connect to browser
    print("\nConnecting to browser...")
    page, browser, _ = await new_page()
    
    # Login
    print("Logging in to Instagram...")
    await login(page)
    print("✓ Logged in!")
    
    # Load seeds
    if os.path.exists("seeds.txt"):
        with open("seeds.txt") as f:
            seeds_loaded = 0
            for line in f.read().splitlines():
                u = line.strip().lower()
                if u and not u.startswith("#"):
                    queue_add(u, priority=100, source="seed")
                    seeds_loaded += 1
            print(f"✓ Loaded {seeds_loaded} seeds")
    else:
        print("⚠ No seeds.txt found!")
        return
    
    # Main processing loop
    dms_sent = 0
    profiles_processed = 0
    
    while dms_sent < MAX_DMS_PER_DAY:
        # Get next profile from queue
        target = queue_next()
        
        if not target:
            wait_min, wait_max = get_delay("queue_empty")
            wait_time = random.uniform(wait_min, wait_max)
            print(f"\nQueue empty - sleeping {wait_time:.0f}s...")
            await asyncio.sleep(wait_time)
            continue
        
        print(f"\n[Queue: {queue_count()} remaining]")
        
        # Process their following list
        await process_following_list(target, page)
        profiles_processed += 1
        
        # Print stats
        stats = get_stats()
        print(f"\n--- Stats ---")
        print(f"Visited: {stats['total_visited']} | Creators: {stats['confirmed_creators']} | DMs: {stats['dms_sent']} | Queue: {stats['queue_size']}")
        
        dms_sent = stats['dms_sent']
        
        # Long delay between seed profiles
        seed_delay_min, seed_delay_max = get_delay("between_seeds")
        seed_wait = random.uniform(seed_delay_min, seed_delay_max)
        print(f"\nWaiting {seed_wait:.0f}s before next seed...")
        await asyncio.sleep(seed_wait)
    
    print("\n" + "=" * 60)
    print(f"Session complete!")
    stats = get_stats()
    print(f"Total visited: {stats['total_visited']}")
    print(f"Confirmed creators: {stats['confirmed_creators']}")
    print(f"DMs sent: {stats['dms_sent']}")
    print("=" * 60)
    
    await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

