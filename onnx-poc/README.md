# ONNX Runtime Web PoC — U-2-Netp 전경 분리 (2026-10-03)

검토 트랙의 실측 PoC. 결론과 적용 내역은
`~/workspace/goals/toonstudio-site-modernization/hidden_files/onnx-review-2026-10-03/findings.md` 참조.

## 파일

- `poc-u2netp.mjs` — Node + onnxruntime-web 1.27.0 (WASM EP)으로 U-2-Netp를
  직접 실행하는 독립 스크립트. 전처리(320×320 직접 리사이즈, 채널 최대값
  정규화 후 ImageNet mean/std, NCHW)와 후처리(융합 출력 "1959" min-max
  정규화)를 rembg 파이프라인과 동일하게 구현했다.
- `u2netp.onnx` — U-2-Netp 가중치 (4,574,861 bytes).
  - sha256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`
  - rembg 공식 릴리스 자산 및 Hugging Face `BritishWerewolf/U-2-Netp`의
    `model.onnx` LFS 해시와 일치함을 2026-10-03 확인.
  - 라이선스: U-2-Net 코드·가중치 모두 Apache-2.0 (상용 가능).

## 실측 (이 VM, 2 vCPU 고부하)

- 추론 CPU 시간 중앙값 2,632ms (n=10, 320×320). 벽시계는 VM 부하 노이즈가
  커서 판정에서 제외.
- 합성 원반 마스크 응답: 안쪽 평균 1.000 / 바깥 0.000.
- `numThreads=4`는 이 VM에서 오히려 악화 — 스레드 수는 런타임 기본값 유지.

## 후속

이 PoC의 경로는 `feat/onnx-web-apply-2026-10-03` 브랜치에서 프로덕션
배선됐다 (`apps/web/src/domains/creator/studio-onnx-*`, 배경 제거 버튼의
"일반 피사체" 경로). 프로덕션 스모크(Node에서 실제 프로바이더+실모델)
에서도 route=wasm 폴백·inside 1.000/outside 0.000·정상상태 중앙값
2,774ms를 재확인했다.
