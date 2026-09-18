import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Specimen tags (e2e)', () => {
  const curatorToken = 'curator-tags-token';
  const developerToken = 'developer-tags-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const endemicTagId = '55555555-5555-4555-8555-555555555555';
  const createdTagId = '66666666-6666-4666-8666-666666666666';
  const attachmentId = '77777777-7777-4777-8777-777777777777';

  let app: INestApplication<App>;
  let specimenRecord: Record<string, unknown>;
  let tags: Array<{ id: string; tag_name: string }>;
  let attachments: Array<{
    id: string;
    specimen_id: string;
    tag_id: string;
  }>;
  let revisionCreate: jest.Mock;
  let auditCreate: jest.Mock;

  beforeEach(async () => {
    specimenRecord = {
      id: specimenId,
      status: 'UNCATALOGED',
      archived_at: null,
    };
    tags = [{ id: endemicTagId, tag_name: 'Endemic' }];
    attachments = [];
    revisionCreate = jest.fn(() => ({}));
    auditCreate = jest.fn(() => ({}));

    const tagDelegate = {
      findMany: jest.fn(
        ({
          where,
          take,
        }: {
          where?: Record<string, unknown>;
          take?: number;
        }) => {
          let result = [...tags];
          const relation = where?.specimen_tag as
            { some?: { specimen_id?: string } } | undefined;
          if (relation?.some?.specimen_id) {
            const attachedIds = new Set(
              attachments
                .filter(
                  (item) => item.specimen_id === relation.some?.specimen_id,
                )
                .map((item) => item.tag_id),
            );
            result = result.filter((item) => attachedIds.has(item.id));
          }

          const tagName = where?.tag_name as { contains?: string } | undefined;
          if (tagName?.contains) {
            const search = tagName.contains.toLocaleLowerCase();
            result = result.filter((item) =>
              item.tag_name.toLocaleLowerCase().includes(search),
            );
          }

          result.sort(
            (left, right) =>
              left.tag_name.localeCompare(right.tag_name) ||
              left.id.localeCompare(right.id),
          );
          return take ? result.slice(0, take) : result;
        },
      ),
      findFirst: jest.fn(
        ({ where }: { where: { tag_name: { equals: string } } }) =>
          tags.find(
            (item) =>
              item.tag_name.toLocaleLowerCase() ===
              where.tag_name.equals.toLocaleLowerCase(),
          ) ?? null,
      ),
      create: jest.fn(({ data }: { data: { tag_name: string } }) => {
        const created = { id: createdTagId, tag_name: data.tag_name };
        tags.push(created);
        return created;
      }),
    };
    const specimenTagDelegate = {
      findUnique: jest.fn(
        ({
          where,
          include,
        }: {
          where: {
            specimen_id_tag_id: { specimen_id: string; tag_id: string };
          };
          include?: { tag?: boolean };
        }) => {
          const key = where.specimen_id_tag_id;
          const found = attachments.find(
            (item) =>
              item.specimen_id === key.specimen_id &&
              item.tag_id === key.tag_id,
          );
          if (!found) return null;
          return include?.tag
            ? {
                ...found,
                tag: tags.find((item) => item.id === found.tag_id),
              }
            : found;
        },
      ),
      create: jest.fn(
        ({ data }: { data: { specimen_id: string; tag_id: string } }) => {
          const created = { id: attachmentId, ...data };
          attachments.push(created);
          return created;
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const index = attachments.findIndex((item) => item.id === where.id);
        const [deleted] = attachments.splice(index, 1);
        return deleted;
      }),
    };
    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id: string } }) => {
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: curatorAccountId,
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: '88888888-8888-4888-8888-888888888888',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      specimen: {
        findUnique: jest.fn(() => specimenRecord),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          specimenRecord = { ...specimenRecord, ...data };
          return specimenRecord;
        }),
      },
      tag: tagDelegate,
      specimen_tag: specimenTagDelegate,
      specimen_revision_history: { create: revisionCreate },
      audit_log: { create: auditCreate },
      $transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
        Promise.resolve(callback(prismaMock)),
      ),
    };
    const getUser = jest.fn((token: string) => {
      const id =
        token === curatorToken
          ? curatorAuthId
          : token === developerToken
            ? developerAuthId
            : null;
      return id
        ? {
            data: { user: { id, email: 'tags@example.com', app_metadata: {} } },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser } })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires an authenticated active Curator', async () => {
    await request(app.getHttpServer()).get('/tags').expect(401);
    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('strictly validates IDs, query bounds, and tag bodies', async () => {
    await request(app.getHttpServer())
      .get('/tags?limit=0')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/tags?limit=101')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/tags?unknown=true')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .post('/specimens/not-a-uuid/tags')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ tagName: 'Endemic' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ tagName: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ tagName: `Invalid${String.fromCharCode(1)}Tag` })
      .expect(400);
  });

  it('searches reusable tags case-insensitively', async () => {
    await request(app.getHttpServer())
      .get('/tags?search=END&limit=10')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect([{ id: endemicTagId, name: 'Endemic' }]);
  });

  it('normalizes, attaches, reuses, lists, and detaches a tag', async () => {
    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ tagName: '  Rare   specimen  ' })
      .expect(201)
      .expect({
        tag: { id: createdTagId, name: 'Rare specimen' },
        attached: true,
      });

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ tagName: 'RARE SPECIMEN' })
      .expect(201)
      .expect({
        tag: { id: createdTagId, name: 'Rare specimen' },
        attached: false,
      });

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect([{ id: createdTagId, name: 'Rare specimen' }]);

    expect(revisionCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);

    await request(app.getHttpServer())
      .delete(`/specimens/${specimenId}/tags/${createdTagId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect({ tagId: createdTagId, detached: true });

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect([]);
    expect(tags).toContainEqual({
      id: createdTagId,
      tag_name: 'Rare specimen',
    });
  });

  it('allows archived reads but rejects archived relationship changes', async () => {
    specimenRecord = {
      ...specimenRecord,
      status: 'ARCHIVED',
      archived_at: new Date(),
    };

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/tags`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ tagName: 'Endemic' })
      .expect(400);
  });
});
