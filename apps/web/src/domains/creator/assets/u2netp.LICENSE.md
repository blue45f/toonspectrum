# U-2-Netp 모델 자산 고지

- 파일: `u2netp.onnx` (4,574,861 bytes)
- SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`
- 모델: U-2-Netp (U²-Net 경량판) — Qin et al., "U²-Net: Going Deeper with
  Nested U-Structure for Salient Object Detection", Pattern Recognition 106
  (2020). 일반 피사체(salient object) 전경 분리용.
- 원본 프로젝트: https://github.com/xuebinqin/U-2-Net — 코드와 가중치 모두
  **Apache License 2.0** (상용 사용 가능).
- 이 파일은 원본 가중치의 커뮤니티 ONNX 변환본으로, rembg 릴리스
  (`danielgatis/rembg` v0.0.0 릴리스 자산 `u2netp.onnx`)과 동일한 바이트다
  (위 SHA-256이 그 배포본의 공인 해시와 일치함을 확인). 변환 자체는 추가
  조건을 부과하지 않으며, 가중치에 대한 권리 부여는 원본 프로젝트의
  Apache-2.0 라이선스를 따른다.
- 텐서 계약: 입력 `input.1` float32 `[1,3,320,320]` (320×320 직접 리사이즈,
  채널 최대값 정규화 + ImageNet mean/std), 출력 7개 중 첫 번째(`1959`)가
  융합 saliency 맵 `[1,1,320,320]`.
- 런타임: onnxruntime-web (MIT License, Microsoft).
