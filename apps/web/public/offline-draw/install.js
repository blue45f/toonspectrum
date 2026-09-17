(() => {
  let installPrompt = null;
  let installButton = null;
  let statusNode = null;
  let manualMode = false;

  const isIos = () => /iPad|iPhone|iPod/u.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isStandalone = () => {
    const navigatorWithStandalone = navigator;
    return Boolean(navigatorWithStandalone.standalone)
      || (typeof window.matchMedia === 'function'
        && window.matchMedia('(display-mode: standalone)').matches);
  };

  const setStatus = (message) => {
    if (statusNode) statusNode.textContent = message;
  };

  const showReady = () => {
    manualMode = false;
    if (!installButton) return;
    installButton.disabled = false;
    installButton.textContent = '드로잉 앱 설치';
    setStatus('전체 툰스튜디오와 별도의 드로잉 앱으로 설치합니다.');
  };

  const showManual = () => {
    manualMode = true;
    if (!installButton) return;
    installButton.disabled = false;
    installButton.textContent = isIos() ? '홈 화면에 추가 방법' : '브라우저 설치 방법';
    setStatus(isIos()
      ? 'Safari 공유 버튼 → ‘홈 화면에 추가’를 선택하면 툰드로잉 앱으로 설치됩니다.'
      : '브라우저 메뉴의 ‘앱 설치’, ‘바로가기 설치’ 또는 ‘Dock에 추가’를 사용해 주세요.');
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    showReady();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) {
      installButton.disabled = false;
      installButton.textContent = '드로잉 시작';
    }
    setStatus('툰드로잉 앱 설치가 완료되었습니다. 앱 목록에서도 바로 열 수 있습니다.');
  });

  document.addEventListener('DOMContentLoaded', () => {
    installButton = document.getElementById('install-app');
    statusNode = document.getElementById('install-status');
    if (!installButton || !statusNode) return;

    if (isStandalone()) {
      installButton.disabled = false;
      installButton.textContent = '드로잉 시작';
      setStatus('현재 독립 앱 창에서 열려 있습니다.');
    } else if (installPrompt) {
      showReady();
    } else if (isIos()) {
      showManual();
    }

    installButton.addEventListener('click', async () => {
      if (isStandalone() || installButton.textContent === '드로잉 시작') {
        window.location.href = '/offline-draw/';
        return;
      }

      if (!installPrompt) {
        showManual();
        return;
      }

      const prompt = installPrompt;
      installPrompt = null;
      installButton.disabled = true;
      installButton.textContent = '설치 확인 중…';
      setStatus('브라우저 설치 창에서 계속해 주세요.');

      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') {
          installButton.disabled = false;
          installButton.textContent = '드로잉 시작';
          setStatus('설치 요청을 수락했습니다. 설치가 끝나면 앱 목록에서도 툰드로잉을 열 수 있습니다.');
        } else {
          installButton.disabled = false;
          installButton.textContent = '드로잉 앱 설치';
          setStatus('설치를 취소했습니다. 원할 때 다시 설치할 수 있습니다.');
        }
      } catch {
        showManual();
      }
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/offline-draw/sw.js', { scope: '/offline-draw/' })
        .catch(() => setStatus('오프라인 준비를 확인하지 못했습니다. 온라인 상태에서 다시 시도해 주세요.'));
    }

    window.setTimeout(() => {
      if (!installPrompt && !isStandalone() && !manualMode) showManual();
    }, 1800);
  });
})();
