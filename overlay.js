// overlay.js —— 在当前页面注入一个弹窗，展示格式化后的 JSON
(function () {
  if (window.__jsonFormatterOverlayLoaded__) return;
  window.__jsonFormatterOverlayLoaded__ = true;

  // 多窗口管理：错位偏移 & 置顶层级
  let openCount = 0;
  let topZ = 2147483000;

  const STYLE = `
    :host { all: initial; }
    .dialog {
      position: fixed;
      width: 620px; height: 480px;
      min-width: 280px; min-height: 160px;
      background: #ffffff; color: #24292f; border-radius: 10px;
      box-shadow: 0 16px 48px rgba(140,149,159,0.4);
      display: flex; flex-direction: column; overflow: hidden;
      border: 1px solid #d0d7de;
      z-index: 2147483647;
      font-family: "SFMono-Regular", "JetBrains Mono", "Menlo", "Consolas", "PingFang SC", monospace;
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; background: #f6f8fa; border-bottom: 1px solid #d0d7de;
      user-select: none;            /* 头部不参与选择/复制 */
      -webkit-user-select: none;
      cursor: move;                 /* 标题栏可拖动窗口 */
    }
    .title { color: #0969da; font-weight: 600; font-size: 14px; }
    .actions button {
      margin-left: 8px; padding: 6px 12px;
      background: #f6f8fa; color: #24292f;
      border: 1px solid #d0d7de; border-radius: 6px;
      cursor: pointer; font-size: 12px;
    }
    .actions button:hover { background: #eaeef2; }
    .actions .btn-copy {
      background: #0969da; color: #ffffff; border-color: #0969da;
      font-weight: 600;
    }
    .actions .btn-copy:hover { background: #0860c7; border-color: #0860c7; }
    .actions .close { background: #fff; color: #cf222e; border-color: #ffc1c2; }
    .actions .close:hover { background: #ffebe9; }
    .status { color: #1a7f37; font-size: 12px; margin-left: 12px; }
    .body {
      flex: 1; overflow: auto; padding: 16px 20px; background: #ffffff;
      user-select: text;            /* 只允许在内容区选择 */
      -webkit-user-select: text;
    }
    .tree { font-size: 13px; line-height: 1.75; white-space: pre; }
    .row { display: block; }
    .toggle {
      display: inline-block; width: 14px; text-align: center;
      cursor: pointer; color: #cf222e; user-select: none; font-size: 12px;
    }
    .toggle.empty { cursor: default; color: transparent; }
    .key { color: #a626a4; font-weight: 600; }       /* 紫色 key */
    .colon { color: #24292f; margin: 0 4px 0 2px; }
    .punc { color: #24292f; }
    .count { color: #8c959f; font-style: italic; margin-left: 6px; font-size: 12px; }
    .v-string { color: #50a14f; }                    /* 绿色字符串 */
    .nested-tag {
      color: #8c959f; font-style: italic; font-size: 11px; margin-left: 6px;
      user-select: none;
    }
    .v-number { color: #4078f2; }                    /* 蓝色数字 */
    .v-boolean { color: #c18401; }
    .v-null { color: #cf222e; }
    .children {
      display: block; padding-left: 22px;
      border-left: 1px dashed #d8dee4; margin-left: 6px;
    }
    .children.collapsed { display: none; }
    .placeholder { color: #8c959f; cursor: pointer; margin-left: 4px; }
    pre.raw {
      white-space: pre-wrap; word-break: break-all;
      background: #f6f8fa; padding: 14px; border-radius: 6px;
      color: #24292f; font-size: 12px; margin: 0;
      border: 1px solid #d0d7de;
    }
    .error-box {
      background: #ffebe9; border: 1px solid #ffc1c2; color: #82071e;
      padding: 12px 16px; border-radius: 6px; margin-bottom: 14px;
      white-space: pre-wrap; word-break: break-all;
    }
    .json-block { margin-bottom: 18px; }
    .json-block:last-child { margin-bottom: 0; }
    .json-label {
      color: #cf222e; font-weight: 600; font-size: 13px;
      margin-bottom: 6px; white-space: pre-wrap; word-break: break-all;
    }
    .hidden { display: none; }
    .resizer {
      position: absolute; right: 0; bottom: 0;
      width: 16px; height: 16px; cursor: nwse-resize;
      background:
        linear-gradient(135deg, transparent 50%, #8c959f 50%, #8c959f 60%, transparent 60%,
        transparent 70%, #8c959f 70%, #8c959f 80%, transparent 80%);
    }
  `;

  // 暴露给 background 调用
  window.__showJsonFormatterOverlay = function (selectedText) {
    showOverlay(selectedText || "");
  };

  function showOverlay(selectedText) {
    const host = document.createElement("div");
    host.className = "__json_formatter_host__";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);

    // 每个窗口独立、可拖动、可缩放，不再有遮罩
    const dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `
      <div class="header">
        <div class="title">JSON 格式化助手</div>
        <div class="actions">
          <span class="status"></span>
          <button class="btn-expand">全部展开</button>
          <button class="btn-collapse">全部折叠</button>
          <button class="btn-copy">复制</button>
          <button class="btn-raw">查看原文</button>
          <button class="close">关闭</button>
        </div>
      </div>
      <div class="body">
        <div class="tree-panel"><div class="tree"></div></div>
        <div class="raw-panel hidden"><pre class="raw"></pre></div>
      </div>
      <div class="resizer"></div>
    `;
    shadow.appendChild(dialog);

    // 错位定位，避免多个窗口完全重叠
    const offset = (openCount++ % 8) * 28;
    dialog.style.left = (60 + offset) + "px";
    dialog.style.top = (60 + offset) + "px";
    dialog.style.zIndex = String(++topZ);

    const $ = (sel) => shadow.querySelector(sel);
    const statusEl = $(".status");
    const treeEl = $(".tree");
    const treePanel = $(".tree-panel");
    const rawPanel = $(".raw-panel");
    const rawEl = $(".raw");

    rawEl.textContent = selectedText;

    // 解析 JSON（兼容多段 JSON、被整体转义/包裹成字符串的日志）
    const segments = extractAllJsonSegments(selectedText);
    // 每个 segment: { label, raw, parsed, error }
    const parsedSegments = segments.map((seg) => {
      const r = parseJsonSmart(seg.raw);
      return { label: seg.label, raw: seg.raw, parsed: r.value, error: r.error };
    });

    const successList = parsedSegments.filter((s) => !s.error && s.parsed !== undefined);

    if (successList.length === 0) {
      // 没有任何片段解析成功，尝试整体解析一次作为兜底
      const fallback = parseJsonSmart(selectedText);
      if (!fallback.error && fallback.parsed !== undefined) {
        parsedSegments.length = 0;
        parsedSegments.push({ label: "", raw: selectedText, parsed: fallback.parsed, error: null });
        successList.push(parsedSegments[0]);
      }
    }

    if (successList.length === 0) {
      const err = document.createElement("div");
      err.className = "error-box";
      const firstErr = parsedSegments[0] && parsedSegments[0].error;
      err.textContent = `JSON 解析失败：${firstErr || "未识别到有效 JSON"}\n\n已切换为显示原始文本，可点击右上角 “查看原文/树形” 切换。`;
      treeEl.appendChild(err);
      treePanel.classList.add("hidden");
      rawPanel.classList.remove("hidden");
    } else {
      let totalNodes = 0;
      parsedSegments.forEach((seg) => {
        if (seg.error || seg.parsed === undefined) return;
        const block = document.createElement("div");
        block.className = "json-block";
        if (seg.label) {
          const lab = document.createElement("div");
          lab.className = "json-label";
          lab.textContent = seg.label;
          block.appendChild(lab);
        }
        block.appendChild(renderNode(seg.parsed));
        treeEl.appendChild(block);
        totalNodes += countNodes(seg.parsed);
      });
      const blockCount = successList.length;
      statusEl.textContent = blockCount > 1
        ? `解析成功，共 ${blockCount} 段 JSON / ${totalNodes} 个节点`
        : `解析成功，共 ${totalNodes} 个节点`;
    }

    // parseErr 仅用于初始 raw/树形面板切换判断
    const parseErr = successList.length === 0
      ? (parsedSegments[0] && parsedSegments[0].error) || "未识别到有效 JSON"
      : null;

    // 事件绑定
    const close = () => host.remove();
    $(".close").onclick = close;

    // 点击窗口任意处置顶
    dialog.addEventListener("mousedown", () => {
      dialog.style.zIndex = String(++topZ);
    });

    // 标题栏拖动
    const header = $(".header");
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return; // 只有点到按钮才不触发拖动
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const startLeft = dialog.offsetLeft, startTop = dialog.offsetTop;
      const onMove = (ev) => {
        dialog.style.left = (startLeft + ev.clientX - startX) + "px";
        dialog.style.top = (startTop + ev.clientY - startY) + "px";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // 右下角缩放
    const resizer = $(".resizer");
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const startW = dialog.offsetWidth, startH = dialog.offsetHeight;
      const onMove = (ev) => {
        dialog.style.width = Math.max(280, startW + ev.clientX - startX) + "px";
        dialog.style.height = Math.max(160, startH + ev.clientY - startY) + "px";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // 把所有成功解析的片段拼成一份格式化文本（多段时附带标签）
    const buildFormattedAll = () => {
      return successList.map((s) => {
        const body = JSON.stringify(s.parsed, null, 2);
        return s.label ? `${s.label}\n${body}` : body;
      }).join("\n\n");
    };

    // 用户选区复制：保留浏览器默认行为，按实际选中文本复制（不再覆盖为全文）
    // 如需复制完整格式化 JSON，请使用右上角“复制”按钮

    $(".btn-expand").onclick = () => toggleAll(shadow, true);
    $(".btn-collapse").onclick = () => toggleAll(shadow, false);
    $(".btn-copy").onclick = async () => {
      try {
        const text = successList.length > 0 ? buildFormattedAll() : selectedText;
        await navigator.clipboard.writeText(text);
        flash(statusEl, "已复制（已格式化，含缩进）");
      } catch {
        flash(statusEl, "复制失败");
      }
    };
    let showingRaw = parseErr != null;
    $(".btn-raw").textContent = showingRaw ? "查看树形" : "查看原文";
    $(".btn-raw").onclick = () => {
      showingRaw = !showingRaw;
      if (showingRaw) {
        treePanel.classList.add("hidden");
        rawPanel.classList.remove("hidden");
        $(".btn-raw").textContent = "查看树形";
      } else {
        treePanel.classList.remove("hidden");
        rawPanel.classList.add("hidden");
        $(".btn-raw").textContent = "查看原文";
      }
    };
  }

  function flash(el, msg) {
    el.textContent = msg;
    setTimeout(() => (el.textContent = ""), 1500);
  }

  function toggleAll(shadow, expand) {
    shadow.querySelectorAll(".children").forEach((el) => {
      if (expand) el.classList.remove("collapsed");
      else el.classList.add("collapsed");
    });
    shadow.querySelectorAll(".toggle").forEach((el) => {
      if (el.classList.contains("empty")) return;
      el.textContent = expand ? "▾" : "▸";
    });
    shadow.querySelectorAll(".placeholder").forEach((el) => {
      el.style.display = expand ? "none" : "inline";
    });
    shadow.querySelectorAll(".close-row").forEach((el) => {
      el.style.display = expand ? "block" : "none";
    });
  }

  // ---------- 渲染节点 ----------
  function renderNode(value, keyName) {
    const row = document.createElement("div");
    row.className = "row";
    const type = getType(value);

    const toggle = document.createElement("span");
    toggle.className = "toggle";

    let keyHtml = "";
    if (keyName !== undefined) {
      keyHtml = `<span class="key">"${escapeHtml(keyName)}"</span><span class="colon">:</span>`;
    }

    if (type === "object" || type === "array") {
      const isArray = type === "array";
      const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
      const openCh = isArray ? "[" : "{";
      const closeCh = isArray ? "]" : "}";

      if (entries.length === 0) {
        toggle.classList.add("empty");
        toggle.textContent = "·";
        row.appendChild(toggle);
        row.insertAdjacentHTML("beforeend", `${keyHtml}<span class="punc">${openCh}${closeCh}</span>`);
        return row;
      }

      toggle.textContent = "▾";
      row.appendChild(toggle);
      row.insertAdjacentHTML(
        "beforeend",
        `${keyHtml}<span class="punc">${openCh}</span><span class="placeholder" style="display:none">...${closeCh}</span>`
      );

      const children = document.createElement("div");
      children.className = "children";
      entries.forEach(([k, v], idx) => {
        const child = renderNode(v, isArray ? undefined : k);
        if (idx < entries.length - 1) {
          const comma = document.createElement("span");
          comma.className = "punc";
          comma.textContent = ",";
          child.appendChild(comma);
        }
        children.appendChild(child);
      });
      row.appendChild(children);

      const closeRow = document.createElement("div");
      closeRow.className = "row close-row";
      closeRow.innerHTML = `<span class="toggle empty">·</span><span class="punc">${closeCh}</span>`;
      row.appendChild(closeRow);

      toggle.onclick = () => {
        const collapsed = children.classList.toggle("collapsed");
        toggle.textContent = collapsed ? "▸" : "▾";
        closeRow.style.display = collapsed ? "none" : "block";
        row.querySelector(".placeholder").style.display = collapsed ? "inline" : "none";
      };
    } else {
      // 字符串值若本身是合法的 JSON（对象/数组），递归展开为子树
      if (type === "string") {
        const nested = tryParseNestedJson(value);
        if (nested !== undefined) {
          toggle.textContent = "▾";
          row.appendChild(toggle);
          const isArr = Array.isArray(nested);
          const openCh = isArr ? "[" : "{";
          const closeCh = isArr ? "]" : "}";
          row.insertAdjacentHTML(
            "beforeend",
            `${keyHtml}<span class="punc">${openCh}</span>` +
            `<span class="nested-tag">JSON 字符串</span>` +
            `<span class="placeholder" style="display:none">...${closeCh}</span>`
          );

          const children = document.createElement("div");
          children.className = "children";
          const entries = isArr ? nested.map((v, i) => [i, v]) : Object.entries(nested);
          entries.forEach(([k, v], idx) => {
            const child = renderNode(v, isArr ? undefined : k);
            if (idx < entries.length - 1) {
              const comma = document.createElement("span");
              comma.className = "punc";
              comma.textContent = ",";
              child.appendChild(comma);
            }
            children.appendChild(child);
          });
          row.appendChild(children);

          const closeRow = document.createElement("div");
          closeRow.className = "row close-row";
          closeRow.innerHTML = `<span class="toggle empty">·</span><span class="punc">${closeCh}</span>`;
          row.appendChild(closeRow);

          toggle.onclick = () => {
            const collapsed = children.classList.toggle("collapsed");
            toggle.textContent = collapsed ? "▸" : "▾";
            closeRow.style.display = collapsed ? "none" : "block";
            row.querySelector(".placeholder").style.display = collapsed ? "inline" : "none";
          };
          // 避免落到下面的纯字符串渲染
          return row;
        }
      }
      toggle.classList.add("empty");
      toggle.textContent = "·";
      row.appendChild(toggle);
      row.insertAdjacentHTML("beforeend", `${keyHtml}${formatPrimitive(value, type)}`);
    }
    return row;
  }

  function formatPrimitive(v, type) {
    if (type === "string") return `<span class="v-string">"${escapeHtml(v)}"</span>`;
    if (type === "number") return `<span class="v-number">${v}</span>`;
    if (type === "boolean") return `<span class="v-boolean">${v}</span>`;
    if (type === "null") return `<span class="v-null">null</span>`;
    return escapeHtml(String(v));
  }

  function getType(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  function countNodes(v) {
    const t = getType(v);
    if (t === "object") return 1 + Object.values(v).reduce((s, x) => s + countNodes(x), 0);
    if (t === "array") return 1 + v.reduce((s, x) => s + countNodes(x), 0);
    return 1;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "\u0026amp;")
      .replace(/</g, "\u0026lt;")
      .replace(/>/g, "\u0026gt;")
      .replace(/"/g, "\u0026quot;");
  }

  function tryUnescape(s) {
    if (s.startsWith('"') && s.endsWith('"')) return JSON.parse(s);
    return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  // 嗅探：若字符串本身是合法的 JSON 对象/数组，返回解析结果；否则 undefined
  // 仅当解析结果为 object/array 时才返回（避免把所有 "abc" 都当成 JSON 来处理）
  function tryParseNestedJson(s) {
    if (typeof s !== "string") return undefined;
    const t = s.trim();
    if (t.length < 2) return undefined;
    const first = t[0];
    const last = t[t.length - 1];
    if (!((first === "{" && last === "}") || (first === "[" && last === "]"))) {
      return undefined;
    }
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object") return v;
    } catch (_) {}
    return undefined;
  }

  // 智能解析：兼容被整体转义、包裹成字符串、或外层包装的 JSON 日志
  function parseJsonSmart(raw) {
    if (raw == null) return { value: undefined, error: "输入为空" };
    const text = String(raw).trim();
    if (!text) return { value: undefined, error: "输入为空" };

    // 1) 直接解析
    try {
      return { value: JSON.parse(text), error: null };
    } catch (e1) {
      // 2) 尝试反转义后再解析（处理 \"key\":\"value\" 这种被整体转义的日志）
      try {
        const unescaped = tryUnescape(text);
        if (unescaped !== text) {
          try {
            return { value: JSON.parse(unescaped), error: null };
          } catch (_) {
            // 反转义后还是失败，再尝试从反转义后的文本里抽取一段 JSON
            const inner = extractJsonSubstring(unescaped);
            if (inner) {
              try {
                return { value: JSON.parse(inner), error: null };
              } catch (_) {}
            }
          }
        }
      } catch (_) {}

      // 3) 如果解析结果是字符串（被双重序列化），递归再解一次
      try {
        const once = JSON.parse(text);
        if (typeof once === "string") {
          try {
            return { value: JSON.parse(once), error: null };
          } catch (_) {}
        }
      } catch (_) {}

      return { value: undefined, error: e1 && e1.message ? e1.message : String(e1) };
    }
  }

  // 从混杂文本里抓出所有顶层 {...}/[...] 段，并把每段前面的非空文本作为 label
  // 返回： [{ label: string, raw: string }, ...]
  function extractAllJsonSegments(text) {
    if (!text) return [];
    const segments = [];
    let cursor = 0;
    let lastEnd = 0;
    while (cursor < text.length) {
      // 找到下一个 { 或 [
      let start = -1;
      for (let i = cursor; i < text.length; i++) {
        const c = text[i];
        if (c === "{" || c === "[") { start = i; break; }
      }
      if (start === -1) break;

      const openCh = text[start];
      const closeCh = openCh === "{" ? "}" : "]";
      let depth = 0, inStr = false, escape = false, end = -1;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
          if (escape) escape = false;
          else if (c === "\\") escape = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === openCh) depth++;
        else if (c === closeCh) {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end === -1) break;

      // 抽取前缀作为 label（去掉尾部的冒号/空白/逗号）
      let label = text.slice(lastEnd, start).trim();
      label = label.replace(/[\s,，]*[:：]\s*$/, "").trim();
      label = label.replace(/[,，]\s*$/, "").trim();

      segments.push({ label, raw: text.slice(start, end + 1) });
      cursor = end + 1;
      lastEnd = cursor;
    }
    return segments;
  }

  // 从混杂文本里抓出第一个 {...} 或 [...]
  function extractJsonSubstring(text) {
    const firstObj = text.indexOf("{");
    const firstArr = text.indexOf("[");
    let start = -1;
    if (firstObj === -1) start = firstArr;
    else if (firstArr === -1) start = firstObj;
    else start = Math.min(firstObj, firstArr);
    if (start === -1) return null;

    const openCh = text[start];
    const closeCh = openCh === "{" ? "}" : "]";
    let depth = 0, inStr = false, escape = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === openCh) depth++;
      else if (c === closeCh) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }
})();