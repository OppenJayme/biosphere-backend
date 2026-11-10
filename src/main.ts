import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { resolveCorsOrigins } from './config/cors.config';
import { resolveTrustProxy } from './config/proxy.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Read the visitor's address from the reverse proxy (see proxy.config.ts).
  app.set('trust proxy', resolveTrustProxy(process.env));

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({ origin: resolveCorsOrigins(process.env) });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BioSphere API')
    .setDescription(
      'REST API for the BioSphere biological museum management system',
    )
    .setVersion('0.1')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  // HOST is optional; the DCISM server binds to 127.0.0.1 so only Apache can
  // reach the API.
  const host = process.env.HOST?.trim();
  const port = process.env.PORT ?? 3000;
  await (host ? app.listen(port, host) : app.listen(port));
}
void bootstrap();
