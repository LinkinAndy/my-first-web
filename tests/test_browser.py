"""Optional regression checks using an isolated Chromium context."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'youxu.tasks.v1'

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
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            expect(page.locator('.task-row')).to_have_count(5)
            expect(page.locator('#progress-count')).to_have_text('2')
            expect(page.locator('#done-count')).to_have_text('1')
            checks.append('首次演示数据及统计')

            def fill(title, owner, status):
                page.locator('[name=title]').fill(title)
                page.locator('[name=owner]').fill(owner)
                page.locator('[name=due]').fill('2026-12-15')
                page.locator('[name=status]').select_option(status)

            page.locator('#add-task').click()
            fill('   ', '测试员', '未开始')
            page.get_by_role('button', name='保存任务').click()
            expect(page.locator('#task-dialog')).to_be_visible()
            expect(page.locator('.task-row')).to_have_count(5)
            fill('<img src=x onerror=alert(1)>测试任务', '测试员', '未开始')
            page.get_by_role('button', name='保存任务').click()
            expect(page.locator('.task-row')).to_have_count(6)
            expect(page.locator('#task-list img')).to_have_count(0)
            checks.append('新增、空白校验与安全文本显示')

            page.get_by_role('button', name='编辑任务：<img src=x onerror=alert(1)>测试任务', exact=True).click()
            fill('测试任务已编辑', '新负责人', '进行中')
            page.get_by_role('button', name='保存任务').click()
            expect(page.locator('#progress-count')).to_have_text('3')
            page.reload()
            expect(page.locator('.task-row')).to_have_count(6)
            expect(page.locator('#task-list')).to_contain_text('测试任务已编辑')
            checks.append('编辑、状态统计与刷新持久化')

            page.locator('#search').fill('新负责人')
            expect(page.locator('.task-row')).to_have_count(1)
            page.locator('#status-filter').select_option('已完成')
            expect(page.locator('.task-row')).to_have_count(0)
            expect(page.locator('#empty-state')).to_be_visible()
            expect(page.locator('#total-count')).to_have_text('6')
            page.locator('#search').fill('')
            expect(page.locator('.task-row')).to_have_count(1)
            page.locator('#status-filter').select_option('all')
            checks.append('组合筛选、无匹配提示与全局统计')

            delete = page.get_by_role('button', name='删除任务：测试任务已编辑', exact=True)
            page.once('dialog', lambda d: d.dismiss())
            delete.click()
            expect(page.locator('.task-row')).to_have_count(6)
            page.once('dialog', lambda d: d.accept())
            delete.click()
            expect(page.locator('.task-row')).to_have_count(5)
            page.reload()
            expect(page.locator('.task-row')).to_have_count(5)
            checks.append('删除取消、确认与持久化')

            for width in [320, 375, 768, 1024, 1440]:
                page.set_viewport_size({'width': width, 'height': 812})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            page.set_viewport_size({'width': 375, 'height': 812})
            page.locator('#add-task').click()
            box = page.locator('#task-dialog').bounding_box()
            assert box['x'] >= 0 and box['x'] + box['width'] <= 375
            fill('手机测试', '移动端', '已完成')
            page.get_by_role('button', name='保存任务').click()
            expect(page.locator('#done-count')).to_have_text('2')
            page.locator('#add-task').click()
            page.keyboard.press('Escape')
            expect(page.locator('#task-dialog')).not_to_be_visible()
            checks.append('375px 手机布局、保存及键盘关闭')
            page.screenshot(path='/tmp/my-first-web-mobile.png', full_page=True)
            page.set_viewport_size({'width': 1440, 'height': 1000})
            page.screenshot(path='/tmp/my-first-web-desktop.png', full_page=True)

            while page.locator('.delete').count():
                page.once('dialog', lambda d: d.accept())
                page.locator('.delete').first.click()
            page.reload()
            expect(page.locator('.task-row')).to_have_count(0)
            expect(page.locator('#total-count')).to_have_text('0')
            checks.append('清空后刷新不恢复演示任务')

            page.evaluate('(key) => localStorage.setItem(key, "broken data")', KEY)
            page.reload()
            expect(page.locator('#notice')).to_contain_text('无法读取本地任务')
            expect(page.locator('#add-task')).to_be_disabled()
            assert page.evaluate('(key) => localStorage.getItem(key)', KEY) == 'broken data'
            checks.append('损坏数据保护')

            page.evaluate('(key) => localStorage.setItem(key, "[]")', KEY)
            page.reload()
            page.evaluate('() => { Storage.prototype.setItem = () => { throw new Error("quota"); }; }')
            page.locator('#add-task').click()
            fill('不可保存', '测试员', '未开始')
            page.get_by_role('button', name='保存任务').click()
            expect(page.locator('#notice')).to_contain_text('保存失败')
            expect(page.locator('#form-error')).to_be_visible()
            expect(page.locator('#task-dialog')).to_be_visible()
            expect(page.locator('#total-count')).to_have_text('0')
            assert page.evaluate('(key) => localStorage.getItem(key)', KEY) == '[]'
            checks.append('存储失败不虚报保存成功')
            assert not errors, errors
            checks.append('无 JavaScript 运行错误')
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    for check in checks:
        print(f'PASS {check}')
    print(f'{len(checks)} checks passed')

if __name__ == '__main__':
    run()
