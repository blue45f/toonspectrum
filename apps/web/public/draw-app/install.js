(() => {
  const DRAW_START_URL = '/studio?drawingShell=app&uiMode=focus&startTool=draw&source=pwa';
  let installPrompt = null;
  let installButton = null;
  let statusNode = null;
  let manualMode = false;

  const isIos = () => /iPad|iPhone|iPod/u.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isStandalone = () => Boolean(navigator.standalone)
    || (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches);

  const setStatus = (message) => {
    if (statusNode) statusNode.textContent = message;
  };

  const showReady = () => {
    manualMode = false;
    if (!installButton) return;
    installButton.disabled = false;
    installButton.textContent = 'ToonStudio Draw 설치';
    setStatus('전체 툰스튜디오와 같은 엔진을 사용하는 드로잉 전용 앱 창으로 설치합니다.');
  };

  const showManual = () => {
    manualMode = true;
    if (!installButton) return;
    installButton.disabled = false;
    installButton.textContent = isIos() ? '홈 화면에 추가 방법' : '브라우저 설치 방법';
    setStatus(isIos()
      ? 'Safari 공유 버튼 → ‘홈 화면에 추가’를 선택하세요. 설치 후 같은 Studio 드로잉 엔진이 앱 UI로 열립니다.'
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
    setStatus('ToonStudio Draw 설치가 완료되었습니다. 작업 데이터와 엔진은 전체 Studio와 동일합니다.');
  });

  document.addEventListener('DOMContentLoaded', async () => {
    installButton = document.getElementById('install-app');
    statusNode = document.getElementById('install-status');
    if (!installButton || !statusNode) return;

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch {
        setStatus('오프라인 앱 셸 준비를 확인하지 못했습니다. 온라인 상태에서 다시 시도해 주세요.');
      }
    }

    if (isStandalone()) {
      installButton.disabled = false;
      installButton.textContent = '드로잉 시작';
      setStatus('현재 앱 창에서 열려 있습니다.');
    } else if (installPrompt) {
      showReady();
    } else if (isIos()) {
      showManual();
    }

    installButton.addEventListener('click', async () => {
      if (isStandalone() || installButton.textContent === '드로잉 시작') {
        window.location.href = DRAW_START_URL;
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
          setStatus('설치 요청을 수락했습니다. 설치가 끝나면 앱 목록에서도 ToonStudio Draw를 열 수 있습니다.');
        } else {
          installButton.disabled = false;
          installButton.textContent = 'ToonStudio Draw 설치';
          setStatus('설치를 취소했습니다. 원할 때 다시 설치할 수 있습니다.');
        }
      } catch {
        showManual();
      }
    });

    window.setTimeout(() => {
      if (!installPrompt && !isStandalone() && !manualMode) showManual();
    }, 1800);
  });
})();
