import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import {
  bindStudioRemoteReferenceImageDeliveryLease,
  StudioRemoteReferenceImageDeliveryAbortedError,
  StudioRemoteReferenceImageDeliveryBusyError,
  StudioRemoteReferenceImageDeliveryLimiter,
  StudioRemoteReferenceImageDeliveryWaitTimeoutError,
} from "./studio-remote-reference-image-delivery";
import { StudioRemoteReferenceImageRequestDto } from "./studio-remote-reference-image.dto";
import { StudioRemoteReferenceImageService } from "./studio-remote-reference-image.service";

import type { StudioRemoteReferenceImageDeliveryLease } from "./studio-remote-reference-image-delivery";
import type { Request, Response } from "express";

const CLIENT_CLOSED_REQUEST_STATUS = 499;

@Controller("creator/reference-images")
export class StudioRemoteReferenceImageController {
  constructor(
    @Inject(StudioRemoteReferenceImageService)
    private readonly service: StudioRemoteReferenceImageService,
    @Inject(StudioRemoteReferenceImageDeliveryLimiter)
    private readonly deliveryLimiter: StudioRemoteReferenceImageDeliveryLimiter
  ) {}

  @Post("import")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("X-Content-Type-Options", "nosniff")
  @Header("Referrer-Policy", "no-referrer")
  async importRemoteImage(
    @Headers("x-user-id") userId: string | undefined,
    @Body(new ZodValidationPipe(StudioRemoteReferenceImageRequestDto))
    body: StudioRemoteReferenceImageRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    if (!userId) {
      throw new UnauthorizedException("원격 참고 이미지를 가져오려면 로그인이 필요합니다.");
    }

    const clientController = new AbortController();
    const abortForClientDisconnect = () => {
      if (!clientController.signal.aborted) clientController.abort();
    };
    const abortForResponseClose = () => {
      if (!response.writableEnded) abortForClientDisconnect();
    };
    request.once("aborted", abortForClientDisconnect);
    response.once("close", abortForResponseClose);
    if (request.aborted || response.destroyed) abortForClientDisconnect();

    let deliveryLease: StudioRemoteReferenceImageDeliveryLease | null = null;
    let responseOwnsDeliveryLease = false;
    try {
      try {
        // Acquire before fetching. Queued requests retain no validated/base64 payload, and the
        // lease remains separate from the service's upstream fetch concurrency limit.
        deliveryLease = await this.deliveryLimiter.acquire(clientController.signal);
      } catch (error) {
        if (error instanceof StudioRemoteReferenceImageDeliveryAbortedError) {
          throw new HttpException(
            "원격 참고 이미지 요청 연결이 종료됐습니다.",
            CLIENT_CLOSED_REQUEST_STATUS
          );
        }
        if (error instanceof StudioRemoteReferenceImageDeliveryBusyError) {
          throw new HttpException(
            {
              code: "creator_remote_reference_delivery_busy",
              message: "원격 참고 이미지 전송이 혼잡합니다. 잠시 후 다시 시도해 주세요.",
            },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
        if (error instanceof StudioRemoteReferenceImageDeliveryWaitTimeoutError) {
          throw new HttpException(
            {
              code: "creator_remote_reference_delivery_wait_timeout",
              message: "원격 참고 이미지 전송 대기 시간이 초과됐습니다. 다시 시도해 주세요.",
            },
            HttpStatus.SERVICE_UNAVAILABLE
          );
        }
        throw error;
      }

      const imported = await this.service.importRemoteImage(
        userId,
        body.url,
        clientController.signal
      );
      if (
        clientController.signal.aborted ||
        request.aborted ||
        response.destroyed ||
        !bindStudioRemoteReferenceImageDeliveryLease(response, deliveryLease)
      ) {
        throw new HttpException(
          "원격 참고 이미지 요청 연결이 종료됐습니다.",
          CLIENT_CLOSED_REQUEST_STATUS
        );
      }
      responseOwnsDeliveryLease = true;
      return imported;
    } finally {
      request.off("aborted", abortForClientDisconnect);
      response.off("close", abortForResponseClose);
      if (!responseOwnsDeliveryLease) deliveryLease?.release();
    }
  }
}
