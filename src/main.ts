import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { resolveCorsOrigins } from './config/cors.config';
import { resolveTrustProxy } from './config/proxy.config';
import { resolveSwaggerEnabled } from './config/swagger.config';

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

  // Off by default in production (see swagger.config.ts).
  if (resolveSwaggerEnabled(process.env)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('BioSphere API')
      .setDescription(
        'REST API for the BioSphere biological museum management system',
      )
      .setVersion('0.1')
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  // HOST is optional. The DCISM server binds to 127.0.0.1, so the API is not
  // reachable from outside except through Apache. Other processes and accounts
  // on the same server can still connect directly (see RATE_LIMITING_GUIDE.md).
  const host = process.env.HOST?.trim();
  const port = process.env.PORT ?? 3000;
  await (host ? app.listen(port, host) : app.listen(port));
}
void bootstrap();
