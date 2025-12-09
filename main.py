import asyncio
import random
import os
import datetime
from database import init_db, queue_add, queue_next, db
from browser_agent import new_page, login
from vision import analyze
from humanize import rnd, human_scroll, mouse_wiggle
from utils import save_proof
from config import CONFIDENCE_THRESHOLD, MAX_DMS_PER_DAY, DM_MESSAGE

init_db()


async def process_one(username: str, page):
    print(f"→ {username}")
    await page.goto(f"https://instagram.com/{username.strip('@')}/")
    await rnd(2, 5)
    await human_scroll(page, random.randint(2, 4))
    
    os.makedirs("screenshots", exist_ok=True)
    
    # === 1. Screenshot the PROFILE page first (for analysis) ===
    profile_shot = f"screenshots/profile_{username}_{int(datetime.datetime.now().timestamp())}.png"
    await page.screenshot(path=profile_shot, full_page=True)
    
    # Analyze the PROFILE screenshot
    data = analyze(profile_shot)
    if not data:
        print(f"  Could not analyze profile for {username}")
        return
        
    print(f"  Confidence: {data.get('confidence', 0)}%, Patreon: {data.get('is_patreon', False)}")
    
    if data.get("confidence", 0) < CONFIDENCE_THRESHOLD:
        print(f"  Skipping - confidence below threshold")
        return

    # Save profile info
    profile_username = data.get("username", username).lstrip("@") if data.get("username") else username
    with db() as c:
        c.execute("""INSERT OR REPLACE INTO profiles(username,display_name,bio_text,link_url,
                     is_patreon,confidence,last_seen) VALUES(?,?,?,?,?,?,?)""",
                  (profile_username, data.get("display_name"), data.get("bio"), data.get("link_url"),
                   data.get("is_patreon"), data.get("confidence"), datetime.datetime.now().isoformat()))

    if data.get("is_patreon") and data.get("confidence", 0) >= CONFIDENCE_THRESHOLD:
        # === SEND DM ===
        with db() as c:
            row = c.execute("SELECT dm_sent FROM profiles WHERE username=?", (profile_username,)).fetchone()
            sent = row[0] if row else False
        
        if not sent:
            try:
                # Click Message button on profile
                await page.click('div[role="button"]:has-text("Message")', timeout=5000)
                await rnd(2, 4)
                await page.fill('textarea[placeholder*="Message"]', DM_MESSAGE)
                await rnd(1, 3)
                await page.keyboard.press("Enter")
                await rnd(3, 6)
                proof = await save_proof(profile_username, page)
                with db() as c:
                    c.execute("UPDATE profiles SET dm_sent=1, dm_sent_at=?, proof_path=? WHERE username=?",
                              (datetime.datetime.now().isoformat(), proof, profile_username))
                print(f"  ✓ DM sent to {profile_username} – proof saved")
            except Exception as e:
                print(f"  DM failed: {e}")
        else:
            print(f"  Already DMed {profile_username}, skipping")

        # === EXPAND TREE – scrape followers of confirmed creators ===
        try:
            await page.click('a[href$="/followers/"]', timeout=10000)
            await rnd(3, 7)
            await human_scroll(page, random.randint(4, 7))
            
            # Mark this creator's followers as scraped
            with db() as c:
                c.execute("INSERT OR IGNORE INTO followers_scraped(username) VALUES(?)", (profile_username,))
            
            # Note: To actually extract follower usernames, you'd need another vision call
            # or DOM scraping here. For now, we just re-queue the confirmed creator
            # so the agent explores similar profiles
            queue_add(profile_username, priority=20, source="confirmed_of")
            
            # Close modal
            await page.keyboard.press("Escape")
            await rnd(1, 2)
        except Exception as e:
            print(f"  Could not expand followers: {e}")

    # Human-like sprinkle - occasionally follow
    if random.random() < 0.12:
        try:
            await page.click('button:has-text("Follow")', timeout=3000)
            print(f"  Followed {username}")
            await rnd()
        except:
            pass


async def main():
    print("=" * 50)
    print("Scout Agent Starting")
    print("=" * 50)
    
    page, ctx, pw = await new_page()
    await login(page)
    print("✓ Logged in to Instagram")

    # Load seeds
    if os.path.exists("seeds.txt"):
        with open("seeds.txt") as f:
            seeds_loaded = 0
            for line in f.read().splitlines():
                u = line.strip()
                if u and not u.startswith("#"):
                    queue_add(u, priority=100)
                    seeds_loaded += 1
            print(f"✓ Loaded {seeds_loaded} seeds from seeds.txt")
    else:
        print("⚠ Warning: seeds.txt not found - add usernames to process")

    profiles_processed = 0
    while profiles_processed < MAX_DMS_PER_DAY:
        target = queue_next()
        if not target:
            print("Queue empty – sleeping 5 min")
            await asyncio.sleep(300)
            continue
        
        print(f"\n[{profiles_processed + 1}/{MAX_DMS_PER_DAY}] Processing: {target}")
        await process_one(target, page)
        profiles_processed += 1
        
        delay = random.uniform(40, 120)
        print(f"  Waiting {delay:.0f}s before next profile...")
        await asyncio.sleep(delay)

    print("\n" + "=" * 50)
    print(f"Session complete! Processed {profiles_processed} profiles")
    print("=" * 50)
    
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
