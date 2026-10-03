# TEED 모델 자산 고지

- 파일: `teed.onnx` (248,429 bytes)
- SHA-256: `607473d7f52dce0b5ff9a294e47950b6cd49ff679a82f71f4eac24cce0168383`
- 모델: TEED (Tiny and Efficient Edge Detector) — Soria et al.,
  "TEED: Tiny and Efficient Edge Detector", 2023. 사진·참조 이미지에서
  선(엣지)만 추출해 밑그림으로 쓰기 위한 경량 엣지 검출기.
- 원본 프로젝트: https://github.com/xavysp/TEED — 코드와 가중치 모두
  **MIT License** (Copyright (c) 2022 Xavier Soria Poma, 상용 사용 가능).
- 이 파일은 공식 BIPED 학습 체크포인트(`5_model.pth`, SHA-256
  `0322caf70f588355aaaf59c2bf5872b21a4b7e9f679971a7a3bb1f69b56a01ba`)를
  직접 ONNX 변환한 것으로, 가중치 값은 원본과 동일하다(state_dict
  누락·초과 0으로 로드 검증). 체크포인트 파일은 공식 저장소가 안내하는
  배포본의 Hugging Face 미러(fal/teed)에서 취득했고 바이트 해시를 위에
  고정했다. 변환 자체는 추가 조건을 부과하지 않으며, 가중치에 대한
  권리 부여는 원본 프로젝트의 MIT 라이선스를 따른다.
- 텐서 계약: 입력 `image` float32 `[1,3,512,512]` (BGR 순서, 0..255에서
  BIPED 평균 [104.007, 116.669, 122.679] 차감 — 공식 테스트 전처리와
  동일), 출력 `edges` float32 `[1,1,512,512]` (융합 엣지 로짓에
  sigmoid를 적용한 확률 0..1).
- 런타임: onnxruntime-web (MIT License, Microsoft).
