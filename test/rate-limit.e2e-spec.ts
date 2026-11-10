import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from './../src/supabase/supabase.constants';

describe('API rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({
        login: jest.fn().mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows five login attempts per minute and rejects the sixth', async () => {
    const server = app.getHttpServer();
    const credentials = {
      email: 'curator@example.com',
      password: 'not-a-real-password',
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(server).post('/auth/login').send(credentials).expect(201);
    }

    await request(server).post('/auth/login').send(credentials).expect(429);
  });
});
