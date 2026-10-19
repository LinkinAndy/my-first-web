"""Optional Playwright checks; the webpage itself has no dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'youxu.todos.v1'
OLD = 'youxu.tasks.v1'

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            expect(page.locator('#empty')).to_be_visible()
            page.locator('#title').fill('   ')
            page.get_by_role('button', name='添加', exact=True).click()
            expect(page.locator('#todos li')).to_have_count(0)
            page.locator('#title').fill('<img src=x onerror=alert(1)>买牛奶')
            page.locator('#title').press('Enter')
            expect(page.locator('#todos li')).to_have_count(1)
            expect(page.locator('#todos img')).to_have_count(0)
            checks.append('空清单、新增、空白校验及安全文本')
            page.get_by_role('checkbox').check()
            expect(page.locator('#count')).to_have_text('0 项待办 · 1 项已完成')
            page.reload()
            expect(page.get_by_role('checkbox')).to_be_checked()
            page.get_by_role('checkbox').uncheck()
            expect(page.locator('#count')).to_have_text('1 项待办 · 0 项已完成')
            checks.append('完成、恢复及刷新保存')
            for width in [320, 375, 768, 1280]:
                page.set_viewport_size({'width': width, 'height': 900})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            checks.append('320–1280px 无横向溢出')
            page.get_by_role('button', name='删除：').click()
            page.reload()
            expect(page.locator('#todos li')).to_have_count(0)
            checks.append('删除全部后刷新仍为空')
            legacy = [
                {'id': 'one', 'title': '旧待办', 'status': '进行中', 'owner': '小夏', 'due': '2026-11-01'},
                {'id': 'two', 'title': '旧完成', 'status': '已完成', 'owner': '小林', 'due': '2026-11-02'},
            ]
            page.evaluate('([key, old, items]) => { localStorage.removeItem(key); localStorage.setItem(old, JSON.stringify(items)); }', [KEY, OLD, legacy])
            original = page.evaluate('(key) => localStorage.getItem(key)', OLD)
            page.reload()
            expect(page.locator('#todos li')).to_have_count(2)
            expect(page.get_by_role('checkbox', name='旧完成', exact=True)).to_be_checked()
            expect(page.get_by_role('checkbox', name='旧待办', exact=True)).not_to_be_checked()
            assert page.evaluate('(key) => localStorage.getItem(key)', OLD) == original
            page.reload()
            expect(page.locator('#todos li')).to_have_count(2)
            checks.append('旧任务迁移、完成状态及原记录保护')
            page.evaluate('() => { Storage.prototype.setItem = () => { throw new Error("quota"); }; }')
            page.get_by_role('checkbox', name='旧待办', exact=True).click()
            expect(page.get_by_role('checkbox', name='旧待办', exact=True)).not_to_be_checked()
            expect(page.locator('#notice')).to_contain_text('保存失败')
            page.get_by_role('button', name='删除：旧待办', exact=True).click()
            expect(page.locator('#todos li')).to_have_count(2)
            page.locator('#title').fill('保存失败测试')
            page.locator('#title').press('Enter')
            expect(page.locator('#todos li')).to_have_count(2)
            expect(page.locator('#title')).to_have_value('保存失败测试')
            checks.append('保存失败时新增、勾选、删除不虚报成功')
            page.reload()
            page.evaluate('(key) => localStorage.setItem(key, "broken")', KEY)
            page.reload()
            expect(page.locator('#title')).to_be_disabled()
            expect(page.locator('#notice')).to_contain_text('保护原记录')
            assert page.evaluate('(key) => localStorage.getItem(key)', KEY) == 'broken'
            checks.append('损坏数据保护')
            assert not errors, errors
            checks.append('无 JavaScript 运行错误')
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    for check in checks:
        print('PASS', check)
    print(f'{len(checks)} checks passed')

if __name__ == '__main__':
    run()
