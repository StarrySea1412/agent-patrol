/* 四枚确定性小样 + 阅读进度条（VOL.12 · 零依赖，种子化随机，全部可复现）。 */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let seed = 20261105;
  const srand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const prog = $("#progress");
  if (prog) {
    const paint = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      prog.style.transform = "scaleX(" + (max > 0 ? h.scrollTop / max : 0) + ")";
    };
    addEventListener("scroll", paint, { passive: true });
    addEventListener("resize", paint, { passive: true });
    paint();
  }


  /* ══ DEMO 01 · 拨测状态机（probes.py evaluate：3 败下线 / 2 成恢复）══ */
  (() => {
    const st = $("#d1-state");
    if (!st) return;
    const S = { up: true, fail: 0, succ: 0, lastFlip: 0, t: 0, log: [] };
    const FAIL_TH = 3, SUCC_TH = 2;
    function log(txt, cls) { S.log.push({ txt, cls }); }
    function render() {
      st.className = "pm-state " + (S.up ? "up" : "down");
      st.innerHTML = (S.up ? "UP" : "DOWN") + ' <span class="zh">' + (S.up ? "在线" : "已下线") + "</span>";
      const lights = [];
      for (let i = 0; i < 3; i++) lights.push('<div class="pm-light' + (i < S.fail ? " f" : "") + '"></div>');
      for (let i = 0; i < 2; i++) lights.push('<div class="pm-light' + (i < S.succ ? " s" : "") + '"></div>');
      $("#d1-lights").innerHTML = lights.join("");
      $("#d1-lbl").innerHTML = "fail_streak <b>" + S.fail + "</b>/3 · succ_streak <b>" + S.succ + "</b>/2";
      $("#d1-kv").innerHTML =
        "<span>当前状态</span><b>" + (S.up ? "up" : "down") + "</b>" +
        "<span>通知策略</span><b>" + "翻转才发" + "</b>" +
        "<span>下轮步进</span><b>" + "15s" + "</b>" +
        "<span>并发上限</span><b>8</b>";
      $("#d1-log").innerHTML = S.log.slice(-30).map((l) => '<span class="' + (l.cls || "") + '">' + esc(l.txt) + "</span>").join("\n");
      $("#d1-log").scrollTop = 1e6;
    }
    $("#d1-fail").onclick = () => {
      S.fail++; S.succ = 0; S.t += 30;
      log("[t+" + S.t + "s] 拨测失败 → fail_streak=" + S.fail, S.up && S.fail >= FAIL_TH ? "bad" : "");
      if (S.up && S.fail >= FAIL_TH) { S.up = false; S.lastFlip = S.t; log("[翻转] 连续 " + FAIL_TH + " 败 → DOWN，事件 + 通知（带原因）", "bad"); }
      render();
    };
    $("#d1-ok").onclick = () => {
      S.succ++; S.fail = 0; S.t += 30;
      log("[t+" + S.t + "s] 拨测成功 → succ_streak=" + S.succ, !S.up && S.succ >= SUCC_TH ? "good" : "");
      if (!S.up && S.succ >= SUCC_TH) {
        const dur = S.t - S.lastFlip;
        S.up = true;
        log("[翻转] 连续 " + SUCC_TH + " 成 → UP，通知带持续时长：" + Math.round(dur / 60) + " 分钟", "good");
      }
      render();
    };
    $("#d1-reset").onclick = () => { Object.assign(S, { up: true, fail: 0, succ: 0, lastFlip: 0, t: 0, log: [] }); log("[初始] up · 独立 15s 步进循环，周期 30s"); render(); };
    $("#d1-reset").onclick();
  })();

  /* ══ DEMO 02 · 健康分秤（rules.py health_score：权重 × 0.5^n）══ */
  (() => {
    const big = $("#d2-big");
    if (!big) return;
    const W = { login: [30, 12], container: [24, 8], disk: [24, 8], memory: [24, 8], cert: [18, 8], cpu: [10, 4], io: [6, 3] };
    const NAMES = { login: "可疑登录", container: "容器退出", disk: "磁盘越限", memory: "内存越限", cert: "证书临期", cpu: "CPU 高", io: "IO 高" };
    const S = { items: [] };
    function score(items, linear) {
      const seen = {};
      let pen = 0;
      items.forEach((it) => {
        const w = W[it.type][it.sev === "crit" ? 0 : 1];
        if (linear) pen += w;
        else { const n = seen[it.type] || 0; seen[it.type] = n + 1; pen += w * Math.pow(0.5, n); }
      });
      return Math.max(0, Math.min(100, Math.round(100 - pen)));
    }
    function status(v) { return v >= 90 ? ["ok", "OK · HEALTHY"] : v >= 70 ? ["warn", "WARN · 需要关注"] : ["crit", "CRIT · 立即处理"]; }
    function render() {
      const v = score(S.items, false), lv = score(S.items, true);
      const [cls, word] = status(v);
      big.className = "hs-big " + cls;
      big.textContent = v;
      $("#d2-status").textContent = word;
      $("#d2-add").innerHTML = Object.keys(W).map((t) => '<button class="ghost" data-t="' + t + '">+ ' + NAMES[t] + "</button>").join("");
      $$("#d2-add button").forEach((b) => { b.onclick = () => { S.items.push({ type: b.dataset.t, sev: "warn" }); render(); }; });
      $("#d2-list").innerHTML = S.items.length
        ? S.items.map((it, i) => (i + 1) + ". " + NAMES[it.type] + " warn · 本条扣 <b>" + (W[it.type][1] * Math.pow(0.5, S.items.slice(0, i).filter((x) => x.type === it.type).length)).toFixed(2) + "</b>").join("\n")
        : "（还没有发现——点上面的按钮往里加）";
      // 曲线：往同一类型 cpu 连续添加 1..10 次的两条分数轨迹
      const n = 10, pts1 = [], pts2 = [];
      for (let k = 1; k <= n; k++) {
        const arr = Array.from({ length: k }, () => ({ type: "cpu", sev: "warn" }));
        pts1.push(score(arr, true)); pts2.push(score(arr, false));
      }
      const svg = $("#d2-svg");
      const px = (i) => 24 + i * (472 / (n - 1)), py = (v) => 150 - (v / 100) * 130;
      let path1 = pts1.map((v, i) => (i ? "L" : "M") + px(i) + " " + py(v)).join(" ");
      let path2 = pts2.map((v, i) => (i ? "L" : "M") + px(i) + " " + py(v)).join(" ");
      svg.innerHTML =
        '<line x1="24" y1="150" x2="496" y2="150" stroke="var(--line-strong)"/><line x1="24" y1="150" x2="24" y2="14" stroke="var(--line-strong)"/>' +
        '<text x="10" y="154" font-size="8" fill="var(--faint)" font-family="monospace">100</text>' +
        '<text x="16" y="20" font-size="8" fill="var(--faint)" font-family="monospace">0</text>' +
        '<path d="' + path1 + '" fill="none" stroke="var(--alarm)" stroke-width="2"/>' +
        '<path d="' + path2 + '" fill="none" stroke="var(--rail)" stroke-width="2.4"/>' +
        '<text x="480" y="' + (py(pts1[n - 1]) - 6) + '" font-size="9" fill="var(--alarm)" font-family="monospace" text-anchor="end">' + pts1[n - 1] + "</text>" +
        '<text x="480" y="' + (py(pts2[n - 1]) + 14) + '" font-size="9" fill="var(--rail)" font-family="monospace" text-anchor="end">' + pts2[n - 1] + "</text>";
      $("#d2-note").innerHTML = "对照曲线：往 <b>cpu</b>（warn 扣 4 分）连续堆 10 条同类告警——线性叠加砸到 <b>" + lv0() + "</b> 分，0.5ⁿ 衰减稳在 <b>" + score(Array.from({ length: 10 }, () => ({ type: "cpu", sev: "warn" })), false) + "</b> 分。分数回答「有几个问题」，不是「日志有多长」。";
      function lv0() { return score(Array.from({ length: 10 }, () => ({ type: "cpu", sev: "warn" })), true); }
    }
    $("#d2-reset").onclick = () => { S.items = []; render(); };
    render();
  })();

  /* ══ DEMO 03 · 根因卡生成器（analysis.py analyze_finding）══ */
  (() => {
    const types = $("#d3-types");
    if (!types) return;
    const T = {
      disk: {
        name: "磁盘越限", sev: "warn", chain: ["磁盘写入持续", "journal/日志堆积", "写入失败风险"],
        root: "磁盘使用率 91% 越过阈值，主要占用来源以深挖输出为准",
        cmd: "$ du -xh /var --max-depth=2 | sort -rh | head -5",
        out: "42G\t/var/log\n38G\t/var/log/app\n4.1G\t/var/lib/docker\n2.3G\t/var/log/journal",
        prop: "journalctl --vacuum-size=500M",
        ai: "日志目录 /var/log 占 42G，其中 app 子目录 38G，与「journal 清理」提案的收益不匹配——建议先确认 app 日志轮转配置（此句为 AI 附加视角，可错）。"
      },
      login: {
        name: "可疑登录", sev: "crit", chain: ["非常见来源登录成功", "凭据可能外泄", "横向移动风险"],
        root: "来源 IP 185.220.101.34 以用户 root 登录成功，不在常见内网段",
        cmd: "$ last -n 5",
        out: "root     pts/1        185.220.101.34   Sat Sep  5 03:12   still logged in",
        prop: "ufw insert 1 deny 185.220.101.34 && passwd root",
        ai: "该网段属已知 Tor 出口段（外部知识），建议同时检查 authorized_keys 是否新增条目（此句为 AI 附加视角，可错）。"
      },
      memory: {
        name: "内存越限", sev: "warn", chain: ["内存逼近 OOM 边界", "swap 压力", "进程被杀风险"],
        root: "内存使用率 93% 越过阈值，占用大头以深挖输出为准",
        cmd: "$ ps aux --sort=-%mem | head -3",
        out: "root  812 91.3 88.2 1489204 1387712 ?  Ss  09:12  812:33 /usr/bin/python3 /opt/app/worker.py",
        prop: null,
        ai: "worker.py 累计 CPU 时间 812 小时且常驻 88% 内存，形态符合缓慢泄漏——与规则结论不冲突，但修复提案缺失（白名单无安全命令），需人工介入。"
      },
      service: {
        name: "服务失败", sev: "crit", chain: ["systemd unit failed", "服务不可用", "上游连锁超时"],
        root: "systemd 报告 unit nginx 处于 failed 状态",
        cmd: "$ systemctl status nginx",
        out: "Active: failed (Result: exit-code) since Sat 2026-09-05 03:14:11 UTC",
        prop: "systemctl restart nginx",
        ai: "失败时间点与一次证书续期窗口接近，重启前建议先 journalctl -u nginx -n 50 确认退出码来源（此句为 AI 附加视角，可错）。"
      },
    };
    const S = { sel: "disk", ai: "on" };
    function render() {
      const c = T[S.sel];
      types.innerHTML = Object.entries(T).map(([k, x]) =>
        '<button class="rc-type" data-k="' + k + '" aria-pressed="' + (S.sel === k) + '"><b>' + x.name + ' <em style="' + (x.sev === "crit" ? "color:var(--alarm);border-color:var(--alarm)" : "color:var(--amber);border-color:var(--amber)") + '">' + x.sev + "</em></b><small>" + x.chain[0] + "</small></button>").join("");
      $$(".rc-type", types).forEach((b) => { b.onclick = () => { S.sel = b.dataset.k; render(); }; });
      const steps = S.ai === "off" ? "" :
        '<span class="cmd">' + esc(c.cmd) + "</span>\n" + esc(c.out);
      const aiHtml = S.ai === "on"
        ? '<div class="rc-ai"><b>AI 叙事（附加视角）：</b>' + esc(c.ai) + "</div>"
        : S.ai === "err"
        ? '<div class="rc-ai err"><b>ai_error：</b>TimeoutError: 请求超时(20s)——事件已记录「AI 叙事失败（诊断继续，规则结论不受影响）」。<br/>root_cause 与提案不受影响。</div>'
        : '<div class="rc-ai" style="opacity:.65"><b>ai_outbound = off：</b>LLM 未出网。卡片照常产出（正常态，非错误态）。</div>';
      $("#d3-card").innerHTML =
        '<div class="rc-chain">' + c.chain.map((s2) => "<span>" + esc(s2) + "</span>").join(' <i>→</i> ') + "</div>" +
        '<div class="rc-root"><b>根因（规则事实）：</b>' + esc(c.root) + "</div>" +
        (steps ? '<div class="rc-steps">' + steps + "</div>" : "") + aiHtml;
      $("#d3-foot").innerHTML =
        '<span class="conf' + (S.ai === "on" ? "" : " mid") + '">confidence: ' + (S.ai === "on" ? "高（有深挖步骤）" : "中（仅规则事实）") + "</span>" +
        (c.prop ? '<span class="prop">提案：' + esc(c.prop) + "</span>" : '<span style="color:var(--amber)">宁可不给提案（memory 无白名单安全命令）</span>');
    }
    const modes = [["on", "AI 成功"], ["err", "AI 超时"], ["off", "AI 未启用"]];
    const bar = document.createElement("div");
    bar.className = "pm-btnrow";
    bar.style.marginTop = "9px";
    bar.innerHTML = modes.map((m) => '<button class="ghost" data-m="' + m[0] + '">' + m[1] + "</button>").join("");
    types.after(bar);
    $$("button", bar).forEach((b) => { b.onclick = () => { S.ai = b.dataset.m; render(); }; });
    render();
  })();

  /* ══ DEMO 04 · 命令安检门（executor.py validate：逐段白名单）══ */
  (() => {
    const rulesEl = $("#d4-rules");
    if (!rulesEl) return;
    const RULES = [
      { re: "^journalctl --vacuum-size=\d+[MG]$", risk: "低危", label: "清理 journal 日志" },
      { re: "^find /var/log -name '\*\.gz' -mtime \+\d+ -delete$", risk: "中危", label: "删除过期压缩日志" },
      { re: "^systemctl restart [a-z0-9@._-]+$", risk: "中危", label: "重启服务" },
      { re: "^ufw insert 1 deny \d{1,3}(\.\d{1,3}){3}$", risk: "中危", label: "防火墙封禁 IP" },
      { re: "^passwd [a-z_][a-z0-9_-]{0,30}$", risk: "高危", label: "轮换口令" },
    ].map((r) => ({ ...r, p: new RegExp(r.re) }));
    const CASES = [
      "journalctl --vacuum-size=500M",
      "systemctl restart nginx",
      "ufw insert 1 deny 185.220.101.34 && passwd root",
      "journalctl --vacuum-size=500M && rm -rf /",
      "systemctl restart nginx; shutdown now",
    ];
    const RISK = { "低危": "lo", "中危": "mid", "高危": "hi" };
    const ORDER = ["低危", "中危", "高危"];
    rulesEl.innerHTML = RULES.map((r) => '<div class="gw-rule"><b>' + esc(r.label) + '</b><em>' + r.risk + "</em> · " + esc(r.re) + "</div>").join("");
    function validate(cmd) {
      const segs = cmd.split("&&").map((x) => x.trim()).filter(Boolean);
      if (!segs.length) return { ok: false, risk: "低危", segs: [], refused: "空命令" };
      let risk = "低危"; const out = []; let bad = null;
      for (const seg of segs) {
        let hit = null;
        for (const r of RULES) { if (r.p.test(seg)) { hit = r; break; } }
        if (hit) { risk = ORDER[Math.max(ORDER.indexOf(risk), ORDER.indexOf(hit.risk))]; out.push({ seg, ok: true, hit }); }
        else { out.push({ seg, ok: false }); if (!bad) bad = seg; }
      }
      return bad ? { ok: false, risk, segs: out, refused: "白名单外命令: " + bad } : { ok: true, risk, segs: out, refused: null };
    }
    function render(cmd) {
      const v = validate(cmd);
      $("#d4-verdict").className = "gw-verdict " + (v.ok ? "allow" : "deny");
      $("#d4-verdict").innerHTML = (v.ok ? "允许执行" : "拒绝") + " <small>· risk=" + v.risk + (v.ok ? " · 下一步：propose_exec 开关 + 20s 超时 + 审计" : "") + "</small>";
      $("#d4-segs").innerHTML = v.segs.map((s) =>
        '<div class="gw-seg ' + (s.ok ? "ok" : "bad") + '"><span class="mk">' + (s.ok ? "✓" : "✗") + '</span><code>' + esc(s.seg) + "</code><span class='risk'>" +
        (s.ok ? "<em class='" + RISK[s.hit.risk] + "'>" + s.hit.risk + " · " + esc(s.hit.label) + "</em>" : "<em class='hi'>白名单外</em>") + "</span></div>").join("");
      $("#d4-audit").innerHTML = "proposal_runs 审计行（一切尝试都留痕）\n" +
        "{ mode: \"mock\", command: \"" + esc(cmd.slice(0, 46)) + (cmd.length > 46 ? "…" : "") + "\", risk: \"" + v.risk + "\", status: \"" + (v.ok ? "ok" : "refused") + "\", output: " +
        (v.ok ? "\"…\"" : "\"" + esc((v.refused || "").slice(0, 30)) + "\"") + ", duration_ms: … }";
    }
    $("#d4-cases").innerHTML = CASES.map((c, i) => '<button class="ghost" data-i="' + i + '">' + esc(c.length > 26 ? c.slice(0, 26) + "…" : c) + "</button>").join("");
    $$("#d4-cases button").forEach((b) => { b.onclick = () => { $("#d4-cmd").value = CASES[+b.dataset.i]; render(CASES[+b.dataset.i]); }; });
    $("#d4-check").onclick = () => render($("#d4-cmd").value);
    $("#d4-cmd").addEventListener("keydown", (e) => { if (e.key === "Enter") render($("#d4-cmd").value); });
    render(CASES[0]);
  })();
})();
