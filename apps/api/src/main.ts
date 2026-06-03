import "./load-env"; // 반드시 첫 import — lib/db가 DATABASE_URL을 읽기 전에 .env.local 주입
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
