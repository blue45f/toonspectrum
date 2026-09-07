import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { expect, it } from "vitest";

import { FortuneController } from "./fortune.controller";
import { FortuneService } from "./fortune.service";

@Module({ controllers: [FortuneController], providers: [FortuneService] })
class FortuneTestModule {}

it("injects the fortune engine without compiler-emitted constructor metadata", async () => {
  const module = await NestFactory.createApplicationContext(FortuneTestModule, { logger: false });
  try {
    const characters = module.get(FortuneController).getCharacters();
    expect(characters.length).toBeGreaterThan(0);
    expect(characters[0]).toHaveProperty("id");
  } finally {
    await module.close();
  }
});
