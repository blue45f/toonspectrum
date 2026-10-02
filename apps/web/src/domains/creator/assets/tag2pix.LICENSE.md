# Tag2Pix 모델 자산 고지

- 파일: `tag2pix.onnx` (79,269,994 bytes)
- SHA-256: `ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc`
- 모델: Tag2Pix — Kim et al., "Tag2Pix: Line Art Colorization Using Text
  Tag With SECat and Changing Loss", ICCV 2019. 선화 + 색 태그 조건 채색용.
- 원본 프로젝트: https://github.com/blandocs/Tag2Pix — 코드와 가중치 모두
  **MIT License** (Copyright (c) 2019 Seoul National University, 상용 사용
  가능). 가중치는 같은 저장소의 GitHub 릴리스 자산으로 배포된다.
- 이 파일은 원본 가중치 2종(생성망 `tag2pix_512.pkl`, 특징 추출망
  `model.pth` — SEResNeXt-Half)을 하나의 ONNX 그래프로 직접 변환한 것으로,
  가중치 값은 원본과 동일하다. 소스 자산 SHA-256:
  - `tag2pix_512.pkl`: `f929bba53e16992097fff82d2a42fbb7bc611d6170b6cac81b37bf940340cf59`
  - `model.pth`: `e59efdfa6e4fe883acfb3fe7e5a6abd0da6363554d67fe8f526e143d64a960df`
  변환 시 생성망 state_dict 전량(누락·초과 0)과 특징망 384/384 텐서가
  바인딩됨을 확인했다. 변환 자체는 추가 조건을 부과하지 않으며, 가중치에
  대한 권리 부여는 원본 프로젝트의 MIT 라이선스를 따른다.
- 학습 데이터: Danbooru2017 일러스트 (저자 논문·저장소 명시). 모델 출력의
  색감 경향(옅은 파스텔)이 이 학습 분포를 따른다.
- 텐서 계약: 입력 `line` float32 `[1,1,512,512]` (흑백 선화, 흰 배경·검은
  선, 0..1), 입력 `tags` float32 `[1,115]` (색 태그 다중핫, 어휘 순서는
  `studio-onnx-tag2pix.ts`의 `STUDIO_TAG2PIX_TAG_NAMES`가 정본), 출력
  `color` float32 `[1,3,512,512]` (tanh 범위 -1..1).
- 런타임: onnxruntime-web (MIT License, Microsoft).
