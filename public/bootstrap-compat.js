(function () {
  "use strict";

  if (typeof window === "undefined") return;
  var isSupported =
    typeof Promise !== "undefined" &&
    typeof fetch !== "undefined" &&
    typeof Symbol !== "undefined";
  if (isSupported) return;

  var root = document.getElementById("root");
  if (!root) return;

  var panel = document.createElement("div");
  panel.style.cssText =
    "padding:40px 20px;text-align:center;font-family:sans-serif;background:#1a1410;color:#fff;min-height:100vh";

  var heading = document.createElement("h2");
  heading.textContent = "브라우저 업데이트가 필요합니다";
  heading.style.cssText = "font-size:24px;margin-bottom:12px;color:#f59e0b";

  var message = document.createElement("p");
  message.textContent =
    "현재 사용 중인 브라우저는 최신 웹 표준을 지원하지 않아 웹사이트를 표시할 수 없습니다. Chrome, Edge, Safari 또는 Firefox 최신 버전으로 업데이트해 주세요.";
  message.style.cssText =
    "font-size:14px;color:#ccc;max-width:480px;margin:0 auto 24px";

  var link = document.createElement("a");
  link.href = "https://www.google.com/chrome/";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Chrome 다운로드";
  link.style.cssText =
    "display:inline-block;padding:12px 24px;background:#f59e0b;color:#000;font-weight:bold;text-decoration:none;border-radius:12px";

  panel.appendChild(heading);
  panel.appendChild(message);
  panel.appendChild(link);
  root.replaceChildren(panel);
})();
