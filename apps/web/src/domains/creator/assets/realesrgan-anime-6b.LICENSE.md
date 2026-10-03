# Real-ESRGAN anime 모델 자산 고지

- 파일: `realesrgan-anime-6b.onnx` (17,939,941 bytes)
- SHA-256: `d5f322810c66580608f60c860c8a93982bea343bedc29d74749eebfeea5d3a80`
- 모델: RealESRGAN_x4plus_anime_6B — Wang et al., Tencent ARC Lab,
  "Real-ESRGAN: Training Real-World Blind Super-Resolution with Pure
  Synthetic Data", ICCVW 2021. 일러스트·애니메이션 4배 확대용 (RRDBNet
  6블록, num_feat 64, num_grow_ch 32).
- 원본 프로젝트: https://github.com/xinntao/Real-ESRGAN — 코드와 가중치
  모두 **BSD 3-Clause License** (상용 사용 가능).
- 이 파일은 공식 릴리스 v0.2.2.4 가중치(`RealESRGAN_x4plus_anime_6B.pth`,
  SHA-256 `f872d837d3c90ed2e05227bed711af5671a6fd1c9f7d7e91c911a61f155e99da`,
  `params_ema`)를 순수 PyTorch RRDBNet 정의로 직접 ONNX 변환한 것으로,
  가중치 값은 원본과 동일하다(state_dict 누락·초과 0으로 로드 검증).
  변환 자체는 추가 조건을 부과하지 않으며, 가중치에 대한 권리 부여는
  원본 프로젝트의 BSD-3-Clause 라이선스를 따른다.
- 텐서 계약: 입력 `input` float32 `[1,3,256,256]` (0..1), 출력 `output`
  float32 `[1,3,1024,1024]` (0..1로 클램프해 사용). 고정 타일 계약이며
  큰 이미지는 클라이언트가 겹침 타일로 나눠 처리한다.
- 런타임: onnxruntime-web (MIT License, Microsoft).
