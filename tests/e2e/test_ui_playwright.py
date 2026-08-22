"""
Playwright E2E UI Test for StoneSync AI Evaluation & Canvas Interface (Python execution)
"""
import socket
import subprocess
import time
import pytest
from playwright.sync_api import sync_playwright

def is_port_open(port=8085):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def test_stonesync_ui_and_ai_evaluation():
    server_proc = None
    if not is_port_open(8085):
        server_proc = subprocess.Popen(
            [".venv/bin/python", "-m", "uvicorn", "server.app:app", "--port", "8085"],
            env={"PYTHONPATH": "."}
        )
        time.sleep(1.5)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 800})

            # 1. Navigate to local app
            page.goto("http://127.0.0.1:8085/go", wait_until="networkidle")
            assert "StoneSync" in page.title()

            # 2. Check Go Canvas Board
            board_canvas = page.locator("#go-board")
            assert board_canvas.is_visible()

            # 3. Check Sensei AI Evaluation Card & Components
            ai_card = page.locator("#ai-eval-card")
            assert ai_card.is_visible()

            score_badge = page.locator("#score-lead-badge")
            assert score_badge.is_visible()

            wr_black = page.locator("#wr-black-text")
            assert "Black" in wr_black.text_content()

            wr_white = page.locator("#wr-white-text")
            assert "White" in wr_white.text_content()

            # 4. Check Top Move Recommendations panel
            page.wait_for_selector(".top-move-item", timeout=5000)
            top_moves = page.locator(".top-move-item")
            assert top_moves.count() > 0

            # 5. Toggle Sensei Hints button
            btn_hints = page.locator("#btn-sensei-hints")
            btn_hints.click()

            # 6. Save screenshot artifact
            page.screenshot(path="artifacts/stonesync_playwright_test.png")
            browser.close()
    finally:
        if server_proc:
            server_proc.terminate()
            server_proc.wait()

if __name__ == "__main__":
    test_stonesync_ui_and_ai_evaluation()
    print("Python Playwright test completed successfully!")
