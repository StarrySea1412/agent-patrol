# 造物手记 VOL.12《住进机房的 Agent》—— 一台巡检 Agent 的解剖 · 准备文档

> 2026-11-05 备料。标本 = hermes-watch（本机自研，D:\project\hermes-watch，backend/app 24 模块 6799 行，只读解剖）。
> 仓库名拟 StarrySea1412/agent-patrol。

## 一、标本关键事实（核对到真实文件）

- **总原则（rules.py 模块注释）**：「Deterministic rule engine: runs before any LLM. **AI narrates and deep-dives, rules decide facts.**」——规则先跑，AI 只叙事。
- **rules.py（189 行）**：
  - DEFAULT_THRESHOLDS：disk 85/95、mem 85/92、cpu 85、load 8、cert 14 天、io 80MB/s、temp 80°C、swap 70%
  - **CLEAR_THRESHOLDS 滞后恢复（Netdata CLEAR 模式）**：触发用 warn/crit，恢复须回落到更低 clear 线（disk 80/mem 80/cpu 75/load 6.0），防告警线附近抖动 flapping；clear 线 = min(内置, 用户主阈值−5)（clear_thresholds()）
  - **health_score = 100 − Σ(类型权重 × 0.5^同类次数)**：SCORE_WEIGHTS 按业务影响（login 30/12 最重、cpu 10/4 最轻），同类重复指数衰减「不再无脑线性叠加砸穿分数」
  - evaluate()：容器 dead 比 exited 重（sev crit）、restarting/paused 是暂态不追
- **probes.py（568 行）**：
  - 五类拨测：URL（条件引擎 url_check：状态码→关键词→证书天数→延迟上限，纯函数）/ TCP / DNS / DoH（RFC 8484）/ ICMP + push 心跳
  - **纯 stdlib DNS 栈**：_build_query/_parse_response/_parse_name（RFC1035 压缩指针）/_parse_rdata，「不引 dnspython」；DoH 复用同一套线格式
  - ICMP：Windows IcmpSendEcho（ctypes，**「64 位 Python 必须显式定参，否则指针被截断 → access violation」**）/ POSIX SOCK_DGRAM（无 root）
  - Gatus 式双阈值防抖：DEFAULT_FAIL_THRESHOLD=3 / SUCCESS_THRESHOLD=2（evaluate()）；push grace 默认 600s
  - DIAL_SEMA=Semaphore(8)；gather return_exceptions=True 隔离；15s 步进；拨测周期默认 30s 与 60s 主机巡检解耦
  - **设计取舍原文：「拨测失败不进 findings（那是主机指标域），Fleet 健康分不被拨测污染」**；通知翻转才发
- **analysis.py（814 行）**：
  - analyze_finding()：深挖 = 真实执行 DEEP_DIVE 只读探针命令（输出截 800 字）→ 根因卡 {root_cause, chain, confidence(有深挖=高/无=中), steps, proposal_id, ai_narration, ai_model, ai_error}
  - **「规则引擎结论永远为准；AI 叙事仅作为附加视角单列，绝不覆盖 root_cause」**；AI 失败事件文案「AI 叙事失败（诊断继续，规则结论不受影响）」
  - _rule_root_cause：**「真实主机的根因陈述 = 规则引擎的事实，不猜测未验证的成因」**（每种类型一句事实 + 「以深挖输出为准」）
  - _proposal_for：**「命令里的 IP/服务名必须来自这台机器的证据，而不是演示剧本」**；「memory/cpu/load/cert：真实主机上没有可安全白名单执行的一键命令，**宁可不给提案**」
  - anonymize()：主机名/IP → 稳定占位符（RFC 5737 文档段 203.0.113），**映射表只存本次调用内存，绝不落库**；ai_outbound 开关门控 LLM
- **executor.py（175 行）**：
  - **铁律：「批准仅记录决策（decide 接口），执行是批准之后另一个显式动作，且受 propose_exec 门控（默认 off）」**
  - WHITELIST 5 条正则 × 危险度：journalctl vacuum 低危 / find 删日志 + systemctl restart + ufw deny 中危 / passwd 高危；validate() **按 && 逐段整体匹配**，任一段不中即拒
  - TIMEOUT 20s；**「绝不静默：一切结果（含被拒/超时）都落 proposal_runs 审计表」**
  - mock 修复让指标曲线真实回落（_mock_recover 曲线可见恢复）
- **collector.py**：SSH 采集 parse_ports/parse_containers/parse_cert_days/parse_logins；probe_real 与 generate_mock 双轨
- **guard.py**：allow/audit（面板登录防护）；DESIGN.md：深海观测站玻璃语言（产品视觉，文章主题反其道行之）

## 二、七章骨架

1. **规则决定事实，AI 负责说话**——rules.py 头注释；findings 与卡片分工；AI 挂了诊断继续（ch5 呼应）
2. **告警也会发抖：滞后与衰减**——CLEAR 滞后阈值 vs flapping；health_score 指数衰减 vs 线性叠加；业务权重表
3. **五种拨测与一台手写的 DNS 栈**——URL 条件引擎/纯 stdlib DNS/IcmpSendEcho 64 位坑/Gatus 双阈值/健康分隔离；D1=拨测状态机
4. **深挖：证据是跑出来的**——DEEP_DIVE 只读探针、800 字截断、根因陈述不猜未验证成因、confidence 规则；D2=健康分秤
5. **根因卡与优雅降级**——card 六字段走查、AI 三态（成功/失败/未启用）、fallback、匿名化 RFC 5737；D3=根因卡生成器
6. **提案：批准不是执行**——铁律、白名单逐段、默认 off、全审计、宁可不给提案；D4=命令安检门
7. **数据不出本机**——ai_outbound/匿名化/guard/SSH 采集只读；收尾回扣 VOL.10/11 授权链

## 三、四枚确定性小样

1. **拨测状态机**（ch3）：fail 3 / success 2 双阈值 + push grace，逐次点击看翻转/防抖
2. **健康分秤**（ch2）：权重表 × 0.5^n 衰减，对比「线性叠加」开关，加发现看分数曲线
3. **根因卡生成器**（ch4/5）：选发现类型 → chain/steps/根因（真实文案）+ AI 附加视角三态（成功/失败/关）
4. **命令安检门**（ch6）：真实 5 条正则白名单，&& 逐段判定 + 风险取最高 + 拒绝原因

## 四、视觉

- **机架走线图**（亮色）：纸 #f1f0ea / 石墨蓝黑 #333e48 / 安全橙 #d96f1f / LED 绿 #3f8f5f；母题 = 机架 U 格横条、LED 圆点、走线虚线、标签牌；与前 11 套全区分
- hero：单眼折纸鸟运维员举值班手电在机架列前
- 小样类名前缀 pm-/hs-/rc-/gw-（先全局 grep 防撞）

## 五、管线

- 拷 agent-orchestrator/build 四件套；heredoc ≤10KB；字体 /tmp/lxgw；生图 GPT 系（噜皮+crz）；tech-stack + README + OFL；发布 = token 建仓 → 代理绕过 push → **Pages 首建后必须 GET /pages 验源分支**（VOL.11 gh-pages 半成品坑）→ curl 200 + diff=0
