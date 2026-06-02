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

  const port = Number(process.env.NEST_API_PORT ?? "4001");
  await app.listen(port);
  console.log(`Nest backend started: http://localhost:${port}`);
}

void bootstrap();
