import asyncio
import os
from datetime import datetime

from database import (
    init_db, add_to_queue, get_next_from_queue, 
    save_profile, mark_dm_sent, was_dm_sent
)
from browser_agent import (
    get_page, login, go_to_profile, 
    open_followers, scroll_followers_modal, take_screenshot
)
from vision import analyze_screenshot, analyze_followers_screenshot
from humanize import random_delay, human_scroll, human_mouse_move
from utils import log, sanitize_username, is_valid_username, ensure_screenshots_dir
from config import CONFIDENCE_THRESHOLD, MAX_DMS_PER_RUN

# Initialize database on import
init_db()
ensure_screenshots_dir()


async def process_profile(username: str, page) -> dict:
    """
    Process a single profile:
    1. Visit their profile
    2. Take a screenshot and analyze with vision
    3. If promising, open their followers
    4. Extract follower usernames and add to queue
    """
    result = {
        "username": username,
        "is_patreon": False,
        "confidence": 0,
        "followers_added": 0
    }
    
    try:
        # Navigate to profile
        await go_to_profile(page, username)
        await human_scroll(page, times=2)
        
        # Take screenshot of profile
        timestamp = int(datetime.now().timestamp())
        profile_path = f"screenshots/profile_{username}_{timestamp}.png"
        await take_screenshot(page, profile_path)
        
        # Analyze with vision AI
        log(f"Analyzing profile screenshot for {username}")
        profile_data = analyze_screenshot(profile_path)
        
        if profile_data:
            result["is_patreon"] = profile_data.get("is_patreon", False)
            result["confidence"] = profile_data.get("confidence", 0)
            
            # Save to database
            save_profile(
                username=username,
                display_name=profile_data.get("display_name"),
                bio_text=profile_data.get("bio"),
                link_url=profile_data.get("link_url"),
                is_patreon=result["is_patreon"],
                confidence=result["confidence"]
            )
            
            log(f"Profile {username}: Patreon={result['is_patreon']}, Confidence={result['confidence']}")
        
        # If this looks like a promising account, explore their followers
        if result["confidence"] >= CONFIDENCE_THRESHOLD or result["is_patreon"]:
            log(f"High confidence profile - exploring followers of {username}")
            
            if await open_followers(page):
                await scroll_followers_modal(page, scroll_count=3)
                
                # Take screenshot of followers
                followers_path = f"screenshots/followers_{username}_{timestamp}.png"
                await take_screenshot(page, followers_path)
                
                # Analyze followers screenshot
                followers_data = analyze_followers_screenshot(followers_path)
                
                if followers_data and followers_data.get("usernames"):
                    for follower_username in followers_data["usernames"]:
                        if is_valid_username(follower_username):
                            clean = sanitize_username(follower_username)
                            # Add to queue with higher priority for likely creators
                            add_to_queue(clean, priority=15)
                            result["followers_added"] += 1
                    
                    log(f"Added {result['followers_added']} followers to queue")
                
                # Close the modal by pressing Escape
                await page.keyboard.press("Escape")
                await random_delay(1, 2)
    
    except Exception as e:
        log(f"Error processing {username}: {e}", "ERROR")
    
    return result


async def main():
    """Main entry point for the Scout agent."""
    log("=" * 50)
    log("Scout Agent Starting")
    log("=" * 50)
    
    # Initialize browser
    log("Connecting to browser...")
    page, context, pw = await get_page()
    
    try:
        # Login to Instagram
        await login(page)
        
        # Load seed accounts from file
        seed_file = "seeds.txt"
        if os.path.exists(seed_file):
            with open(seed_file) as f:
                for line in f.read().splitlines():
                    line = line.strip()
                    if line and not line.startswith("#"):
                        clean = sanitize_username(line)
                        if is_valid_username(clean):
                            add_to_queue(clean, priority=20)  # Seeds get high priority
                            log(f"Added seed: {clean}")
        else:
            log("No seeds.txt found - please add seed usernames", "WARN")
        
        # Main processing loop
        dms_sent = 0
        profiles_processed = 0
        
        while dms_sent < MAX_DMS_PER_RUN:
            username = get_next_from_queue()
            
            if not username:
                log("Queue empty - done for now")
                break
            
            log(f"\n--- Processing: {username} ({profiles_processed + 1}) ---")
            
            result = await process_profile(username, page)
            profiles_processed += 1
            
            # Log summary
            log(f"Completed: {username} | OF: {result['is_patreon']} | "
                f"Conf: {result['confidence']} | New followers: {result['followers_added']}")
            
            # Be nice - random delay between profiles
            delay = 30 + (60 * (profiles_processed % 5 == 0))  # Extra delay every 5 profiles
            log(f"Waiting {delay}s before next profile...")
            await random_delay(delay * 0.8, delay * 1.2)
        
        log("\n" + "=" * 50)
        log(f"Session Complete!")
        log(f"Profiles processed: {profiles_processed}")
        log(f"DMs sent: {dms_sent}")
        log("=" * 50)
        
    except Exception as e:
        log(f"Fatal error: {e}", "ERROR")
        raise
    
    finally:
        # Cleanup
        log("Closing browser...")
        await context.close()
        await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
