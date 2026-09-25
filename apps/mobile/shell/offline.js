const studioUrl = "https://www.toonstudio.cloud/studio";
const retryButton = document.querySelector("#retry");
const status = document.querySelector("#status");

retryButton?.addEventListener("click", () => {
  retryButton.disabled = true;
  if (status) status.textContent = "툰스튜디오에 다시 연결하는 중…";
  window.setTimeout(() => window.location.replace(studioUrl), 150);
});

window.addEventListener("online", () => {
  if (status) status.textContent = "네트워크가 복구되었습니다. 다시 연결해 주세요.";
});
