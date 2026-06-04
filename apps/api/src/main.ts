import "./load-env"; // 반드시 첫 import — lib/db가 DATABASE_URL을 읽기 전에 .env.local 주입
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  // 기본 본문 파서(100kb) 대신 직접 등록 — 창작 스튜디오가 data-URL 이미지(페이지/문서)를 전송하므로 한도를 키운다.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: "16mb" }));
  app.use(urlencoded({ extended: true, limit: "16mb" }));
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
    })
  );

  // PaaS(Render/Railway/Fly 등)는 PORT를 주입한다. 로컬은 NEST_API_PORT, 둘 다 없으면 4001.
  const port = Number(process.env.PORT ?? process.env.NEST_API_PORT ?? "4001");
  await app.listen(port, "0.0.0.0"); // 외부 트래픽 수신을 위해 모든 인터페이스에 바인딩
  console.log(`Nest backend started on port ${port}`);
}

void bootstrap();
