// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "format-json",
    title: "JSON 格式化",
    contexts: ["selection"]
  });
});

// 点击菜单 → 向当前 tab 注入 overlay.js，并传入选中文本
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "format-json") return;
  if (!tab || tab.id == null) return;

  const selected = (info.selectionText || "").trim();
  if (!selected) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ["overlay.js"]
    });
    // 注入后，再把选中文本作为参数发送进去
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: (text) => {
        if (typeof window.__showJsonFormatterOverlay === "function") {
          window.__showJsonFormatterOverlay(text);
        }
      },
      args: [selected]
    });
  } catch (e) {
    console.error("[JSON 格式化助手] 注入失败：", e);
  }
});