const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
// Synthetic-only HTTP compatibility check: no AppModule, dotenv, credentials or database.
const localRequire = createRequire(resolve(__dirname, '../package.json'));
localRequire('reflect-metadata');
const { Controller, Get, Module } = localRequire('@nestjs/common');
const { NestFactory } = localRequire('@nestjs/core');
const { DocumentBuilder, SwaggerModule, ApiOperation } =
  localRequire('@nestjs/swagger');
const swaggerRequire = createRequire(
  localRequire.resolve('@nestjs/swagger/package.json'),
);
const yaml = swaggerRequire('js-yaml');
const yamlVersion = swaggerRequire('js-yaml/package.json').version;
class FixtureController {
  read() {
    return { ok: true };
  }
}
Controller('fixture')(FixtureController);
const descriptor = Object.getOwnPropertyDescriptor(
  FixtureController.prototype,
  'read',
);
Get()(FixtureController.prototype, 'read', descriptor);
const description = 'Synthetic only: # museum\nUnicode: mañana • 日本語';
ApiOperation({ summary: 'Read synthetic fixture', description })(
  FixtureController.prototype,
  'read',
  descriptor,
);
class FixtureModule {}
Module({ controllers: [FixtureController] })(FixtureModule);
(async () => {
  let app;
  const checks = [];
  const check = (name, condition) => {
    assert.ok(condition, name);
    checks.push(name);
  };
  try {
    app = await NestFactory.create(FixtureModule, {
      logger: ['error', 'warn'],
    });
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Synthetic BioSphere compatibility')
        .setVersion('1.0.0')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    check(
      'fixture binds loopback only',
      address.address === '127.0.0.1' &&
        address.port !== 3000 &&
        address.port !== 3001,
    );
    const origin = 'http://127.0.0.1:' + address.port;
    const get = (path) =>
      fetch(origin + path, { signal: AbortSignal.timeout(5000) });
    const route = await get('/fixture');
    check(
      'real Nest fixture responds',
      route.status === 200 && (await route.json()).ok === true,
    );
    const jsonResponse = await get('/docs-json');
    const json = await jsonResponse.json();
    check(
      'OpenAPI JSON route and operation',
      jsonResponse.status === 200 &&
        json.paths['/fixture'].get.summary === 'Read synthetic fixture',
    );
    const yamlResponse = await get('/docs-yaml');
    const yamlText = await yamlResponse.text();
    check(
      'OpenAPI YAML route and content type',
      yamlResponse.status === 200 &&
        /yaml/i.test(yamlResponse.headers.get('content-type') || ''),
    );
    const decoded = yaml.load(yamlText);
    check(
      'YAML preserves known info',
      decoded.info.title === 'Synthetic BioSphere compatibility' &&
        decoded.info.version === '1.0.0',
    );
    check(
      'YAML preserves multiline Unicode description',
      decoded.paths['/fixture'].get.description === description,
    );
    assert.deepEqual(decoded.paths, json.paths);
    checks.push('JSON and YAML operation shapes agree');
    const ui = await get('/docs/');
    check(
      'Swagger UI remains available',
      ui.status === 200 && (await ui.text()).includes('swagger-ui'),
    );
    process.stdout.write(
      JSON.stringify({
        passed: checks.length,
        checks,
        yamlVersion,
        syntheticOnly: true,
      }) + '\n',
    );
  } finally {
    await app?.close();
  }
})().catch((error) => {
  process.stderr.write(error.stack || String(error));
  process.exitCode = 1;
});
