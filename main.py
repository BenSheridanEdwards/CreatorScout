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
from humanize import rnd, human_scroll, mouse_wiggle
from config import MAX_DMS_PER_DAY, DM_MESSAGE, CONFIDENCE_THRESHOLD

init_db()

BATCH_SIZE = 10  # Process 10 profiles at a time from following list


async def get_bio_from_page(page) -> str | None:
    """Extract bio text from current profile page."""
    try:
        # Instagram bio is typically in a span or div in the header section
        bio_selectors = [
            'header section > div.-vDIg > span',
            'header section span:not([class])',
            'div[class*="biography"]',
            'section > div > span',
        ]
        
        for selector in bio_selectors:
            try:
                element = await page.query_selector(selector)
                if element:
                    text = await element.inner_text()
                    if text and len(text) > 10:
                        return text
            except:
                continue
        
        # Fallback: get all text from header
        header = await page.query_selector('header')
        if header:
            return await header.inner_text()
            
    except Exception as e:
        print(f"  Could not extract bio: {e}")
    
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
        await page.wait_for_selector('div[role="dialog"]', timeout=5000)
        await rnd(1, 2)
        
        # Get all list items in the modal
        # Instagram following modal uses a list structure
        items = await page.query_selector_all('div[role="dialog"] a[role="link"][href^="/"]')
        
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
            await rnd(0.5, 1.5)
    except:
        pass


async def check_dm_thread_empty(page) -> bool:
    """Check if DM thread is empty (no previous messages)."""
    try:
        # Look for message bubbles or "No messages" indicator
        messages = await page.query_selector_all('div[role="row"]')
        return len(messages) <= 1  # Just the input row
    except:
        return True  # Assume empty if we can't check


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
    await rnd(2, 4)
    await mouse_wiggle(page)
    
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
        print(f"    Exploring linktree: {link_url[:50]}...")
        
        try:
            # Click the link to open linktree
            link_element = await page.query_selector(f'a[href="{link_url}"]')
            if link_element:
                await link_element.click()
                await rnd(3, 5)
                
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
                await rnd(2, 3)
                
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
                await page.click('div[role="button"]:has-text("Message")', timeout=5000)
                await rnd(2, 4)
                
                # Check if thread is empty
                if await check_dm_thread_empty(page):
                    await page.fill('textarea[placeholder*="Message"]', DM_MESSAGE)
                    await rnd(1, 2)
                    await page.keyboard.press("Enter")
                    await rnd(2, 4)
                    
                    # Screenshot proof
                    proof_path = f"screenshots/dm_{username}_{int(datetime.now().timestamp())}.png"
                    await page.screenshot(path=proof_path)
                    
                    mark_dm_sent(username, proof_path)
                    result["dm_sent"] = True
                    print(f"    ✓ DM sent!")
                else:
                    print(f"    Thread not empty, skipping DM")
                
                # Go back to profile
                await page.go_back()
                await rnd(1, 2)
                
            except Exception as e:
                print(f"    DM failed: {e}")
        
        # Follow if not already
        if not was_followed(username):
            try:
                await page.click('button:has-text("Follow")', timeout=3000)
                mark_followed(username)
                result["followed"] = True
                print(f"    ✓ Followed!")
                await rnd(1, 2)
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
    await rnd(2, 4)
    await human_scroll(page, 2)
    
    # Click Following to open modal
    try:
        await page.click('a[href$="/following/"]', timeout=10000)
        await rnd(2, 4)
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
            await rnd(1, 2)
            
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
            await rnd(2, 3)
            await page.click('a[href$="/following/"]', timeout=10000)
            await rnd(2, 3)
            
            # Scroll back to position
            if scroll_index > 0:
                await scroll_modal(page, times=scroll_index // 5)
            
            # Random delay between profiles
            await rnd(5, 15)
        
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
        await rnd(2, 4)
    
    print(f"\nFinished {seed_username}: {new_profiles_found} new profiles, {creators_found} creators found")
    
    # Close modal
    await page.keyboard.press("Escape")


async def main():
    print("=" * 60)
    print("  Scout - Instagram Patreon Creator Discovery Agent")
    print("=" * 60)
    
    # Connect to browser
    print("\nConnecting to browser...")
    page, ctx, pw = await new_page()
    
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
            print("\nQueue empty - sleeping 5 minutes...")
            await asyncio.sleep(300)
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
        delay = random.uniform(60, 180)
        print(f"\nWaiting {delay:.0f}s before next seed...")
        await asyncio.sleep(delay)
    
    print("\n" + "=" * 60)
    print(f"Session complete!")
    stats = get_stats()
    print(f"Total visited: {stats['total_visited']}")
    print(f"Confirmed creators: {stats['confirmed_creators']}")
    print(f"DMs sent: {stats['dms_sent']}")
    print("=" * 60)
    
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
