"""
Script to generate an interactive Playwright browser video recording for StoneSync GUI.
"""
import os
import socket
import subprocess
import time
from playwright.sync_api import sync_playwright

def is_port_open(port=8085):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def record_browser_session():
    os.makedirs("artifacts", exist_ok=True)
    server_proc = None
    if not is_port_open(8085):
        server_proc = subprocess.Popen(
            [".venv/bin/python", "-m", "uvicorn", "server.app:app", "--port", "8085"],
            env={"PYTHONPATH": "."}
        )
        time.sleep(2.0)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                record_video_dir="artifacts/",
                record_video_size={"width": 1280, "height": 800}
            )
            page = context.new_page()

            # 1. Navigate to AI match room
            print("🎥 Navigating to StoneSync GUI...")
            page.goto("http://127.0.0.1:8085/go?room=demo-session&mode=ai", wait_until="networkidle")
            time.sleep(1.5)

            # 2. Toggle Sensei Hints
            print("💡 Toggling Sensei Tactical Hints...")
            btn_hints = page.locator("#btn-sensei-hints")
            btn_hints.click()
            time.sleep(1.5)

            # 3. Simulate stone placements on canvas
            print("⚫⚪ Placing stones on Go board canvas...")
            board_canvas = page.locator("#go-board")
            box = board_canvas.bounding_box()
            if box:
                cx = box["x"] + box["width"] / 2
                cy = box["y"] + box["height"] / 2

                # Click center star point (T10)
                page.mouse.click(cx, cy)
                time.sleep(1.0)

                # Click upper right corner star point (Q16)
                page.mouse.click(cx + box["width"] * 0.25, cy - box["height"] * 0.25)
                time.sleep(1.0)

                # Click lower left corner star point (D4)
                page.mouse.click(cx - box["width"] * 0.25, cy + box["height"] * 0.25)
                time.sleep(1.0)

            # 4. Switch Theme to Obsidian Glass
            print("💎 Switching theme to Obsidian Glass...")
            theme_select = page.locator("#theme-select")
            if theme_select.is_visible():
                theme_select.select_option("obsidian")
                time.sleep(1.5)

            # 5. Switch Theme to Cyberpunk Neon
            print("⚡ Switching theme to Cyberpunk Neon...")
            if theme_select.is_visible():
                theme_select.select_option("cyberpunk")
                time.sleep(1.5)

            # 6. Capture full-page screenshot artifact
            page.screenshot(path="artifacts/stonesync_session_snapshot.png", full_page=True)
            print("📸 Captured screenshot artifact: artifacts/stonesync_session_snapshot.png")

            # Close context to save video file
            context.close()
            browser.close()

            # Rename recorded video file to standard name
            video_files = [f for f in os.listdir("artifacts") if f.endswith(".webm")]
            if video_files:
                latest_video = sorted(video_files, key=lambda f: os.path.getmtime(os.path.join("artifacts", f)))[-1]
                target_video = "artifacts/stonesync_gui_session.webm"
                os.replace(os.path.join("artifacts", latest_video), target_video)
                print(f"🎬 Video recording saved to: {target_video}")

    finally:
        if server_proc:
            server_proc.terminate()
            server_proc.wait()

if __name__ == "__main__":
    record_browser_session()
